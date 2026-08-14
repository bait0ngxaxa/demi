import "server-only";

import { Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";

import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { getPrisma } from "@/lib/db/prisma";
import {
  provisionPasswordAuthIdentity,
  type ProvisionPasswordAuthIdentityResult,
} from "@/modules/auth/services/password-auth-provisioning-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ApplicationError,
  ConflictError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  platformAdminBootstrapInputSchema,
  type PlatformAdminBootstrapInput,
} from "../schemas/platform-admin-bootstrap-schemas";

export type PlatformAdminBootstrapDatabase = PrismaClient;

export type PlatformAdminBootstrapDependencies = {
  database?: PlatformAdminBootstrapDatabase;
  provisionIdentity?: (input: {
    userId: string;
    password: string;
  }) => Promise<ProvisionPasswordAuthIdentityResult>;
  deleteProviderIdentity?: (authSubject: string) => Promise<void>;
};

export type PlatformAdminBootstrapResult = {
  userId: string;
};

type BootstrapIdentity = {
  personId: string;
  userId: string;
  identityKeyHash: string;
};

export class PlatformAdminBootstrapReconciliationError extends InfrastructureError {
  readonly requiresReconciliation = true;

  constructor() {
    super("Platform admin bootstrap requires identity reconciliation");
    this.name = "PlatformAdminBootstrapReconciliationError";
  }
}

function getDatabase(
  dependencies: PlatformAdminBootstrapDependencies,
): PlatformAdminBootstrapDatabase {
  return dependencies.database ?? getPrisma();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function normalizeDatabaseError(error: unknown, fallbackMessage: string): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002")) {
    return new ConflictError("The requested platform admin identity already exists");
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError("Platform admin bootstrap conflicted with another bootstrap");
  }

  return new InfrastructureError(fallbackMessage);
}

function requiresReconciliation(error: unknown): boolean {
  if (!(error instanceof Error) && (typeof error !== "object" || error === null)) {
    return false;
  }

  return "requiresReconciliation" in error && error.requiresReconciliation === true;
}

async function hasPlatformAdmin(database: PlatformAdminBootstrapDatabase): Promise<boolean> {
  try {
    const existingAdmin = await database.userRole.findFirst({
      where: { role: Role.ADMIN },
      select: { userId: true },
    });

    return existingAdmin !== null;
  } catch {
    throw new InfrastructureError("Platform admin bootstrap could not verify existing admins");
  }
}

function throwExistingAdminConflict(): never {
  throw new ConflictError(
    "A Platform ADMIN already exists; first-admin bootstrap is no longer available",
  );
}

function createIdentityKeyHash(nationalId: string): string {
  try {
    return hashIdentityReference({
      namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
      value: nationalId,
    });
  } catch {
    throw new InfrastructureError("Platform admin identity resolution is unavailable");
  }
}

async function createBootstrapIdentity(
  database: PlatformAdminBootstrapDatabase,
  input: {
    identityKeyHash: string;
    givenName: string;
    familyName: string;
  },
): Promise<BootstrapIdentity> {
  try {
    const identity = await database.$transaction(async (transaction) => {
      const person = await transaction.person.create({
        data: {
          identityKeyHash: input.identityKeyHash,
          givenName: input.givenName,
          familyName: input.familyName,
        },
        select: { id: true },
      });

      const user = await transaction.user.create({
        data: {
          personId: person.id,
          status: UserStatus.PROVISIONED,
        },
        select: { id: true },
      });

      return {
        personId: person.id,
        userId: user.id,
      };
    });

    return { ...identity, identityKeyHash: input.identityKeyHash };
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Platform admin identity could not be created");
  }
}

async function deleteBootstrapIdentity(
  database: PlatformAdminBootstrapDatabase,
  identity: BootstrapIdentity,
  expectedAuthSubject: string | null,
): Promise<void> {
  try {
    await database.$transaction(async (transaction) => {
      const deletedUser = await transaction.user.deleteMany({
        where: {
          id: identity.userId,
          personId: identity.personId,
          authSubject: expectedAuthSubject,
          status: UserStatus.PROVISIONED,
          roles: { none: {} },
          memberships: { none: {} },
          auditEvents: { none: {} },
          hospitalOnboardingApplications: { none: {} },
          hospitalOnboardingReviews: { none: {} },
        },
      });

      if (deletedUser.count !== 1) {
        throw new Error("Bootstrap identity changed during compensation");
      }

      const deletedPerson = await transaction.person.deleteMany({
        where: {
          id: identity.personId,
          identityKeyHash: identity.identityKeyHash,
        },
      });

      if (deletedPerson.count !== 1) {
        throw new Error("Bootstrap person changed during compensation");
      }
    });
  } catch {
    throw new PlatformAdminBootstrapReconciliationError();
  }
}

async function deleteProviderIdentityByDefault(authSubject: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authSubject);

    if (error) {
      throw error;
    }
  } catch {
    throw new PlatformAdminBootstrapReconciliationError();
  }
}

async function compensateProviderAndIdentity(
  database: PlatformAdminBootstrapDatabase,
  identity: BootstrapIdentity,
  authSubject: string,
  dependencies: PlatformAdminBootstrapDependencies,
): Promise<void> {
  const deleteProviderIdentity =
    dependencies.deleteProviderIdentity ?? deleteProviderIdentityByDefault;

  try {
    await deleteProviderIdentity(authSubject);
  } catch {
    throw new PlatformAdminBootstrapReconciliationError();
  }

  await deleteBootstrapIdentity(database, identity, authSubject);
}

async function verifyProvisionedMapping(
  database: PlatformAdminBootstrapDatabase,
  identity: BootstrapIdentity,
  authSubject: string,
): Promise<void> {
  let user: {
    personId: string;
    authSubject: string | null;
    status: UserStatus;
  } | null;

  try {
    user = await database.user.findUnique({
      where: { id: identity.userId },
      select: {
        personId: true,
        authSubject: true,
        status: true,
      },
    });
  } catch {
    throw new InfrastructureError("Platform admin authentication mapping could not be verified");
  }

  if (!user || user.personId !== identity.personId || user.authSubject !== authSubject) {
    throw new InfrastructureError("Platform admin authentication mapping is not ready");
  }

  if (user.status !== UserStatus.PROVISIONED) {
    throw new ConflictError("Platform admin identity changed before activation");
  }
}

async function finalizePlatformAdmin(
  database: PlatformAdminBootstrapDatabase,
  identity: BootstrapIdentity,
  authSubject: string,
): Promise<void> {
  try {
    await database.$transaction(
      async (transaction) => {
        const existingAdmin = await transaction.userRole.findFirst({
          where: { role: Role.ADMIN },
          select: { userId: true },
        });

        if (existingAdmin) {
          throwExistingAdminConflict();
        }

        const targetUser = await transaction.user.findUnique({
          where: { id: identity.userId },
          select: {
            personId: true,
            authSubject: true,
            status: true,
            roles: { select: { role: true } },
            memberships: { select: { id: true } },
          },
        });

        if (
          !targetUser ||
          targetUser.personId !== identity.personId ||
          targetUser.status !== UserStatus.PROVISIONED ||
          targetUser.authSubject !== authSubject
        ) {
          throw new ConflictError("Platform admin identity changed before activation");
        }

        if (targetUser.roles.length > 0 || targetUser.memberships.length > 0) {
          throw new ConflictError("Platform admin identity already has application authority");
        }

        const activatedUser = await transaction.user.updateMany({
          where: {
            id: identity.userId,
            personId: identity.personId,
            status: UserStatus.PROVISIONED,
            authSubject,
          },
          data: { status: UserStatus.ACTIVE },
        });

        if (activatedUser.count !== 1) {
          throw new ConflictError("Platform admin identity changed during activation");
        }

        await transaction.userRole.create({
          data: {
            userId: identity.userId,
            role: Role.ADMIN,
          },
        });

        await recordAuditEvent(
          {
            actorUserId: null,
            action: "platform_admin.bootstrapped",
            resourceType: "User",
            resourceId: identity.userId,
            metadata: {
              role: Role.ADMIN,
              source: "trusted_cli",
            },
          },
          transaction,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    if (isKnownRequestError(error, "P2034")) {
      if (await hasPlatformAdmin(database)) {
        throwExistingAdminConflict();
      }
    }

    throw normalizeDatabaseError(error, "Platform admin authority could not be finalized");
  }
}

export async function bootstrapPlatformAdmin(
  input: PlatformAdminBootstrapInput,
  dependencies: PlatformAdminBootstrapDependencies = {},
): Promise<PlatformAdminBootstrapResult> {
  const parsed = platformAdminBootstrapInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Platform admin bootstrap data is invalid");
  }

  const database = getDatabase(dependencies);

  if (await hasPlatformAdmin(database)) {
    throwExistingAdminConflict();
  }

  const identityKeyHash = createIdentityKeyHash(parsed.data.nationalId);
  let existingPerson: { id: string } | null;

  try {
    existingPerson = await database.person.findUnique({
      where: { identityKeyHash },
      select: { id: true },
    });
  } catch {
    throw new InfrastructureError("Platform admin identity could not be resolved");
  }

  if (existingPerson) {
    throw new ConflictError(
      "This Thai National ID already maps to an existing DEMI identity; explicit reconciliation is required",
    );
  }

  const identity = await createBootstrapIdentity(database, {
    identityKeyHash,
    givenName: parsed.data.givenName,
    familyName: parsed.data.familyName,
  });

  const provisionIdentity = dependencies.provisionIdentity ?? provisionPasswordAuthIdentity;
  let provisionedIdentity: ProvisionPasswordAuthIdentityResult;

  try {
    provisionedIdentity = await provisionIdentity({
      userId: identity.userId,
      password: parsed.data.password,
    });
  } catch (error: unknown) {
    if (requiresReconciliation(error)) {
      throw error;
    }

    await deleteBootstrapIdentity(database, identity, null);
    throw normalizeDatabaseError(error, "Platform admin authentication could not be provisioned");
  }

  const authSubject = provisionedIdentity.authSubject.trim();

  if (provisionedIdentity.userId !== identity.userId || !authSubject) {
    if (provisionedIdentity.userId !== identity.userId) {
      throw new PlatformAdminBootstrapReconciliationError();
    }

    await deleteBootstrapIdentity(database, identity, null);
    throw new InfrastructureError("Platform admin authentication returned an invalid identity");
  }

  try {
    await verifyProvisionedMapping(database, identity, authSubject);
  } catch (error: unknown) {
    await compensateProviderAndIdentity(database, identity, authSubject, dependencies);
    throw error;
  }

  try {
    await finalizePlatformAdmin(database, identity, authSubject);
  } catch (error: unknown) {
    await compensateProviderAndIdentity(database, identity, authSubject, dependencies);
    throw error;
  }

  return { userId: identity.userId };
}
