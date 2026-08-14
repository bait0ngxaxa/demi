import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  WorkforceActivationMode,
  type PrismaClient,
} from "@prisma/client";

import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { getPrisma } from "@/lib/db/prisma";
import {
  PasswordAuthProvisioningReconciliationError,
  provisionPasswordAuthIdentity,
  type ProvisionPasswordAuthIdentityResult,
} from "@/modules/auth/services/password-auth-provisioning-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  createIdentityStore,
  resolvePerson,
} from "@/modules/identity/services/identity-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import { assertWorkforcePolicy, WORKFORCE_CAPABILITIES } from "../policies/workforce-policy";
import {
  hospitalMemberProvisionSchema,
  osmProvisionSchema,
  workforceActivationCompletionSchema,
  workforceActivationRequestSchema,
  workforceActivationTokenSchema,
  workforceListSchema,
  type HospitalMemberProvisionInput,
  type OsmProvisionInput,
  type WorkforceActivationCompletionInput,
  type WorkforceActivationRequestInput,
  type WorkforceActivationMode as WorkforceActivationModeValue,
  type WorkforceKind,
  type WorkforceListInput,
} from "../schemas/workforce-schemas";
import {
  generateWorkforceActivationCredential,
  getWorkforceActivationExpiry,
  hashWorkforceActivationToken,
  toPrismaActivationMode,
  type ActivationCredentialGenerator,
} from "./activation-token-service";

export type WorkforceDatabase = PrismaClient;

export type WorkforceServiceDependencies = {
  database?: WorkforceDatabase;
  now?: () => Date;
  generateCredential?: ActivationCredentialGenerator;
  provisionIdentity?: (input: {
    userId: string;
    password: string;
  }) => Promise<ProvisionPasswordAuthIdentityResult>;
  deleteProviderIdentity?: (authSubject: string) => Promise<void>;
  detachAuthSubject?: (input: { userId: string; authSubject: string }) => Promise<boolean>;
  transactionRetries?: number;
};

export type WorkforceProvisioningResult = {
  kind: WorkforceKind;
  userId: string;
  personId: string;
  hospitalId: string;
  relationshipId: string;
  accountStatus: UserStatus;
  relationshipStatus: MembershipStatus;
  activationRequired: boolean;
  activationToken: string | null;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
  reusedExistingUser: boolean;
  idempotent: boolean;
};

export type WorkforceOwnerHospital = {
  id: string;
  hospitalCode: string;
  name: string;
};

export type WorkforceListRow = {
  id: string;
  userId: string;
  displayName: string;
  kind: WorkforceKind;
  profession: HospitalMemberProvisionInput["profession"] | null;
  relationshipStatus: MembershipStatus;
  accountStatus: UserStatus;
  activationRequired: boolean;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
};

export type WorkforceListResult = {
  hospital: WorkforceOwnerHospital;
  rows: WorkforceListRow[];
};

type WorkforceIdentity = {
  personId: string;
  userId: string;
  userStatus: UserStatus;
  authSubject: string | null;
  relationshipId: string;
  relationshipStatus: MembershipStatus;
  activationToken: string | null;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
  relationshipCreated: boolean;
  relationshipChanged: boolean;
  reusedExistingUser: boolean;
};

type ActivationClaim = {
  activationId: string;
  userId: string;
  claimedAt: Date;
};

const DEFAULT_TRANSACTION_RETRIES = 2;
const workforceActivationSelect = {
  id: true,
  userId: true,
  mode: true,
  expiresAt: true,
  claimedAt: true,
  usedAt: true,
  revokedAt: true,
} satisfies Prisma.WorkforceActivationSelect;

export class WorkforceActivationReconciliationError extends InfrastructureError {
  readonly requiresReconciliation = true;

  constructor() {
    super("Workforce activation requires provider reconciliation");
    this.name = "WorkforceActivationReconciliationError";
  }
}

function getDatabase(dependencies: WorkforceServiceDependencies): WorkforceDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: WorkforceServiceDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
}

function normalizeDatabaseError(error: unknown, fallbackMessage: string): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002")) {
    return new ConflictError("The requested workforce state conflicts with existing data");
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError("The workforce operation conflicted with another request");
  }

  return new InfrastructureError(fallbackMessage);
}

async function runSerializable<T>(
  database: WorkforceDatabase,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryLimit: number,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isRetryableTransactionError(error) || retryCount >= retryLimit) {
        throw error;
      }

      retryCount += 1;
    }
  }
}

async function assertOwnerInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  targetHospitalId: string,
): Promise<void> {
  const actor = await transaction.user.findUnique({
    where: { id: actorUserId },
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (
    actor?.status !== UserStatus.ACTIVE ||
    !actor.roles.some(({ role }) => role === Role.HOSPITAL)
  ) {
    throw new ForbiddenError();
  }

  const ownerMembership = await transaction.hospitalMembership.findFirst({
    where: {
      userId: actorUserId,
      hospitalId: targetHospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });

  if (!ownerMembership) {
    throw new ForbiddenError();
  }
}

function assertActorPolicy(
  actor: ActorContext | null | undefined,
  capability: (typeof WORKFORCE_CAPABILITIES)[keyof typeof WORKFORCE_CAPABILITIES],
  targetHospitalId: string,
): void {
  assertWorkforcePolicy({ actor, capability, targetHospitalId });
}

function assertUserAccountCanReceiveWorkforce(user: {
  status: UserStatus;
  authSubject: string | null;
}): void {
  if (user.status === UserStatus.ACTIVE) {
    if (!user.authSubject || !zUuid(user.authSubject)) {
      throw new ConflictError("The existing account has an invalid authentication mapping");
    }

    return;
  }

  if (user.status === UserStatus.PROVISIONED && !user.authSubject) {
    return;
  }

  throw new ConflictError("The existing account requires reconciliation before workforce use");
}

function zUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function toWorkforceActivationMode(mode: WorkforceActivationMode): WorkforceActivationModeValue {
  return mode === WorkforceActivationMode.ASSISTED ? "ASSISTED" : "REMOTE";
}

async function findCurrentActivation(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<Prisma.WorkforceActivationGetPayload<{ select: typeof workforceActivationSelect }> | null> {
  return transaction.workforceActivation.findFirst({
    where: {
      userId,
      usedAt: null,
      revokedAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: workforceActivationSelect,
  });
}

async function issueInitialActivation(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    createdByUserId: string;
    now: Date;
    dependencies: WorkforceServiceDependencies;
  },
): Promise<{
  activationToken: string | null;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
}> {
  const existing = await findCurrentActivation(transaction, input.userId);

  if (existing) {
    return {
      activationToken: null,
      activationExpiresAt: existing.expiresAt,
      activationMode: toWorkforceActivationMode(existing.mode),
    };
  }

  const credential = (input.dependencies.generateCredential ??
    generateWorkforceActivationCredential)();
  const mode = WorkforceActivationMode.REMOTE;
  const expiresAt = getWorkforceActivationExpiry(input.now, "REMOTE");
  const activation = await transaction.workforceActivation.create({
    data: {
      userId: input.userId,
      tokenHash: credential.tokenHash,
      mode,
      expiresAt,
      createdByUserId: input.createdByUserId,
    },
    select: { id: true },
  });

  await recordAuditEvent(
    {
      actorUserId: input.createdByUserId,
      action: "workforce_activation.issued",
      resourceType: "WorkforceActivation",
      resourceId: activation.id,
      metadata: {
        mode,
        status: UserStatus.PROVISIONED,
        source: "workforce_provisioning",
      },
    },
    transaction,
  );

  return {
    activationToken: credential.plaintextToken,
    activationExpiresAt: expiresAt,
    activationMode: "REMOTE",
  };
}

async function ensureHospitalMembership(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    hospitalId: string;
    profession: HospitalMemberProvisionInput["profession"];
    userStatus: UserStatus;
  },
): Promise<{
  id: string;
  status: MembershipStatus;
  created: boolean;
  changed: boolean;
}> {
  const existing = await transaction.hospitalMembership.findUnique({
    where: {
      userId_hospitalId: {
        userId: input.userId,
        hospitalId: input.hospitalId,
      },
    },
    select: {
      id: true,
      membershipType: true,
      profession: true,
      status: true,
    },
  });

  const expectedStatus =
    input.userStatus === UserStatus.ACTIVE
      ? MembershipStatus.ACTIVE
      : MembershipStatus.PROVISIONED;

  if (!existing) {
    const created = await transaction.hospitalMembership.create({
      data: {
        userId: input.userId,
        hospitalId: input.hospitalId,
        membershipType: MembershipType.MEMBER,
        profession: input.profession,
        status: expectedStatus,
      },
      select: { id: true, status: true },
    });

    return { ...created, created: true, changed: true };
  }

  if (existing.membershipType === MembershipType.OWNER) {
    throw new ConflictError("An existing Hospital Owner membership cannot be downgraded");
  }

  if (existing.profession && existing.profession !== input.profession) {
    throw new ConflictError("The existing Hospital membership has a different profession");
  }

  if (
    existing.status === MembershipStatus.INVITED ||
    existing.status === MembershipStatus.SUSPENDED
  ) {
    throw new ConflictError("The existing Hospital membership is not available for reuse");
  }

  if (existing.status === MembershipStatus.ACTIVE && input.userStatus !== UserStatus.ACTIVE) {
    throw new ConflictError("The existing Hospital membership is active before the account");
  }

  const nextStatus =
    existing.status === MembershipStatus.PROVISIONED && input.userStatus === UserStatus.ACTIVE
      ? MembershipStatus.ACTIVE
      : existing.status;
  const nextProfession = existing.profession ?? input.profession;
  const changed = nextStatus !== existing.status || nextProfession !== existing.profession;

  if (!changed) {
    return {
      id: existing.id,
      status: existing.status,
      created: false,
      changed: false,
    };
  }

  const updated = await transaction.hospitalMembership.update({
    where: { id: existing.id },
    data: {
      profession: nextProfession,
      status: nextStatus,
    },
    select: { id: true, status: true },
  });

  return { ...updated, created: false, changed: true };
}

async function ensureOsmRelationship(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    hospitalId: string;
    userStatus: UserStatus;
  },
): Promise<{
  id: string;
  status: MembershipStatus;
  created: boolean;
  changed: boolean;
}> {
  const existing = await transaction.osmHospitalRelationship.findUnique({
    where: {
      userId_hospitalId: {
        userId: input.userId,
        hospitalId: input.hospitalId,
      },
    },
    select: { id: true, status: true },
  });

  const expectedStatus =
    input.userStatus === UserStatus.ACTIVE
      ? MembershipStatus.ACTIVE
      : MembershipStatus.PROVISIONED;

  if (!existing) {
    const created = await transaction.osmHospitalRelationship.create({
      data: {
        userId: input.userId,
        hospitalId: input.hospitalId,
        status: expectedStatus,
      },
      select: { id: true, status: true },
    });

    return { ...created, created: true, changed: true };
  }

  if (
    existing.status === MembershipStatus.INVITED ||
    existing.status === MembershipStatus.SUSPENDED
  ) {
    throw new ConflictError("The existing OSM relationship is not available for reuse");
  }

  if (existing.status === MembershipStatus.ACTIVE && input.userStatus !== UserStatus.ACTIVE) {
    throw new ConflictError("The existing OSM relationship is active before the account");
  }

  if (existing.status === MembershipStatus.PROVISIONED && input.userStatus === UserStatus.ACTIVE) {
    const updated = await transaction.osmHospitalRelationship.update({
      where: { id: existing.id },
      data: { status: MembershipStatus.ACTIVE },
      select: { id: true, status: true },
    });

    return { ...updated, created: false, changed: true };
  }

  return { ...existing, created: false, changed: false };
}

async function assertActivationTargetRelationship(
  transaction: Prisma.TransactionClient,
  request: WorkforceActivationRequestInput,
): Promise<void> {
  if (request.kind === "OSM") {
    const relationship = await transaction.osmHospitalRelationship.findUnique({
      where: {
        userId_hospitalId: {
          userId: request.userId,
          hospitalId: request.targetHospitalId,
        },
      },
      select: { status: true },
    });

    if (!relationship || relationship.status !== MembershipStatus.PROVISIONED) {
      throw new ConflictError("The OSM relationship is not awaiting activation");
    }

    return;
  }

  const membership = await transaction.hospitalMembership.findUnique({
    where: {
      userId_hospitalId: {
        userId: request.userId,
        hospitalId: request.targetHospitalId,
      },
    },
    select: { membershipType: true, status: true },
  });

  if (
    !membership ||
    membership.membershipType !== MembershipType.MEMBER ||
    membership.status !== MembershipStatus.PROVISIONED
  ) {
    throw new ConflictError("The Hospital membership is not awaiting activation");
  }
}

async function assertTargetUserCanReceiveWorkforce(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const adminRole = await transaction.userRole.findUnique({
    where: {
      userId_role: {
        userId,
        role: Role.ADMIN,
      },
    },
    select: { userId: true },
  });

  if (adminRole) {
    throw new ConflictError("The existing account requires explicit reconciliation");
  }
}

async function createOrReuseWorkforceIdentity(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    kind: WorkforceKind;
    hospitalId: string;
    nationalId: string;
    givenName: string;
    familyName: string;
    profession: HospitalMemberProvisionInput["profession"] | null;
    now: Date;
    dependencies: WorkforceServiceDependencies;
  },
): Promise<WorkforceIdentity> {
  await assertOwnerInDatabase(transaction, input.actorUserId, input.hospitalId);

  const person = await resolvePerson(
    {
      identity: {
        namespace: "thai-national-id",
        value: input.nationalId,
      },
      givenName: input.givenName,
      familyName: input.familyName,
    },
    createIdentityStore(transaction),
  );

  let user = await transaction.user.findUnique({
    where: { personId: person.id },
    select: {
      id: true,
      personId: true,
      status: true,
      authSubject: true,
    },
  });
  const reusedExistingUser = user !== null;

  if (!user) {
    user = await transaction.user.create({
      data: {
        personId: person.id,
        status: UserStatus.PROVISIONED,
      },
      select: {
        id: true,
        personId: true,
        status: true,
        authSubject: true,
      },
    });
  }

  await assertTargetUserCanReceiveWorkforce(transaction, user.id);
  assertUserAccountCanReceiveWorkforce(user);

  const consumedActivation = await transaction.workforceActivation.findFirst({
    where: { userId: user.id, usedAt: { not: null } },
    select: { id: true },
  });

  if (consumedActivation && user.status === UserStatus.PROVISIONED) {
    throw new ConflictError("The existing account has an ambiguous activation state");
  }

  await transaction.userRole.upsert({
    where: {
      userId_role: {
        userId: user.id,
        role: input.kind === "OSM" ? Role.OSM : Role.HOSPITAL,
      },
    },
    update: {},
    create: {
      userId: user.id,
      role: input.kind === "OSM" ? Role.OSM : Role.HOSPITAL,
    },
  });

  const relationship =
    input.kind === "OSM"
      ? await ensureOsmRelationship(transaction, {
          userId: user.id,
          hospitalId: input.hospitalId,
          userStatus: user.status,
        })
      : await ensureHospitalMembership(transaction, {
          userId: user.id,
          hospitalId: input.hospitalId,
          profession: input.profession!,
          userStatus: user.status,
        });

  if (relationship.created || relationship.changed) {
    await recordAuditEvent(
      {
        actorUserId: input.actorUserId,
        action:
          input.kind === "OSM"
            ? "osm_relationship.provisioned"
            : "hospital_membership.provisioned",
        resourceType: input.kind === "OSM" ? "OsmHospitalRelationship" : "HospitalMembership",
        resourceId: relationship.id,
        metadata: {
          role: input.kind === "OSM" ? Role.OSM : Role.HOSPITAL,
          profession: input.profession,
          status: relationship.status,
        },
      },
      transaction,
    );
  }

  const activation =
    user.status === UserStatus.PROVISIONED
      ? await issueInitialActivation(transaction, {
          userId: user.id,
          createdByUserId: input.actorUserId,
          now: input.now,
          dependencies: input.dependencies,
        })
      : {
          activationToken: null,
          activationExpiresAt: null,
          activationMode: null,
        };

  return {
    personId: person.id,
    userId: user.id,
    userStatus: user.status,
    authSubject: user.authSubject,
    relationshipId: relationship.id,
    relationshipStatus: relationship.status,
    activationToken: activation.activationToken,
    activationExpiresAt: activation.activationExpiresAt,
    activationMode: activation.activationMode,
    relationshipCreated: relationship.created,
    relationshipChanged: relationship.changed,
    reusedExistingUser,
  };
}

function toProvisioningResult(
  kind: WorkforceKind,
  identity: WorkforceIdentity,
): WorkforceProvisioningResult {
  return {
    kind,
    userId: identity.userId,
    personId: identity.personId,
    hospitalId: "",
    relationshipId: identity.relationshipId,
    accountStatus: identity.userStatus,
    relationshipStatus: identity.relationshipStatus,
    activationRequired: identity.userStatus === UserStatus.PROVISIONED,
    activationToken: identity.activationToken,
    activationExpiresAt: identity.activationExpiresAt,
    activationMode: identity.activationMode,
    reusedExistingUser: identity.reusedExistingUser,
    idempotent: !identity.relationshipCreated && !identity.relationshipChanged,
  };
}

async function provisionWorkforce(
  actor: ActorContext | null | undefined,
  kind: WorkforceKind,
  input: HospitalMemberProvisionInput | OsmProvisionInput,
  dependencies: WorkforceServiceDependencies,
): Promise<WorkforceProvisioningResult> {
  const database = getDatabase(dependencies);
  const targetHospitalId = input.targetHospitalId;
  const capability =
    kind === "OSM" ? WORKFORCE_CAPABILITIES.osmProvision : WORKFORCE_CAPABILITIES.create;

  assertActorPolicy(actor, capability, targetHospitalId);

  try {
    const identity = await runSerializable(
      database,
      (transaction) =>
        createOrReuseWorkforceIdentity(transaction, {
          actorUserId: actor!.userId,
          kind,
          hospitalId: targetHospitalId,
          nationalId: input.nationalId,
          givenName: input.givenName,
          familyName: input.familyName,
          profession:
            kind === "OSM" || !("profession" in input) ? null : input.profession,
          now: getNow(dependencies),
          dependencies,
        }),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );

    return {
      ...toProvisioningResult(kind, identity),
      hospitalId: targetHospitalId,
    };
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Workforce provisioning could not be completed");
  }
}

export async function provisionHospitalMember(
  actor: ActorContext | null | undefined,
  input: HospitalMemberProvisionInput,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceProvisioningResult> {
  const parsed = hospitalMemberProvisionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital member data is invalid");
  }

  return provisionWorkforce(actor, "HOSPITAL_MEMBER", parsed.data, dependencies);
}

export async function provisionOsm(
  actor: ActorContext | null | undefined,
  input: OsmProvisionInput,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceProvisioningResult> {
  const parsed = osmProvisionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("OSM data is invalid");
  }

  return provisionWorkforce(actor, "OSM", parsed.data, dependencies);
}

export async function listWorkforceOwnerHospitals(
  actor: ActorContext | null | undefined,
  database: WorkforceDatabase = getPrisma(),
): Promise<WorkforceOwnerHospital[]> {
  if (!actor?.roles.includes(Role.HOSPITAL)) {
    throw new ForbiddenError();
  }

  try {
    const currentActor = await database.user.findUnique({
      where: { id: actor.userId },
      select: { status: true, roles: { select: { role: true } } },
    });

    if (
      currentActor?.status !== UserStatus.ACTIVE ||
      !currentActor.roles.some(({ role }) => role === Role.HOSPITAL)
    ) {
      throw new ForbiddenError();
    }

    const hospitals = await database.hospital.findMany({
      where: {
        status: HospitalStatus.ACTIVE,
        memberships: {
          some: {
            userId: actor.userId,
            membershipType: MembershipType.OWNER,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }],
      select: { id: true, hospitalCode: true, name: true },
    });

    return hospitals;
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Workforce Hospital scope could not be loaded");
  }
}

function toDisplayName(givenName: string | null, familyName: string | null): string {
  return [givenName, familyName].filter(Boolean).join(" ") || "ไม่ระบุชื่อ";
}

export async function listWorkforce(
  actor: ActorContext | null | undefined,
  input: WorkforceListInput,
  database: WorkforceDatabase = getPrisma(),
): Promise<WorkforceListResult> {
  const parsed = workforceListSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Workforce Hospital selection is invalid");
  }

  assertActorPolicy(actor, WORKFORCE_CAPABILITIES.read, parsed.data.targetHospitalId);

  try {
    const hospital = await database.hospital.findFirst({
      where: {
        id: parsed.data.targetHospitalId,
        status: HospitalStatus.ACTIVE,
        memberships: {
          some: {
            userId: actor!.userId,
            membershipType: MembershipType.OWNER,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      select: { id: true, hospitalCode: true, name: true },
    });

    if (!hospital) {
      throw new NotFoundError("The selected Hospital was not found");
    }

    const [memberships, osmRelationships] = await Promise.all([
      database.hospitalMembership.findMany({
        where: {
          hospitalId: hospital.id,
          membershipType: MembershipType.MEMBER,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          userId: true,
          profession: true,
          status: true,
          user: {
            select: {
              status: true,
              person: { select: { givenName: true, familyName: true } },
            },
          },
        },
      }),
      database.osmHospitalRelationship.findMany({
        where: { hospitalId: hospital.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          userId: true,
          status: true,
          user: {
            select: {
              status: true,
              person: { select: { givenName: true, familyName: true } },
            },
          },
        },
      }),
    ]);

    const userIds = [
      ...memberships.map(({ userId }) => userId),
      ...osmRelationships.map(({ userId }) => userId),
    ];
    const activations = userIds.length
      ? await database.workforceActivation.findMany({
          where: {
            userId: { in: userIds },
            usedAt: null,
            revokedAt: null,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            userId: true,
            mode: true,
            expiresAt: true,
          },
        })
      : [];
    const activationByUserId = new Map(
      activations.map((activation) => [activation.userId, activation]),
    );

    const rows: WorkforceListRow[] = [
      ...memberships.map((membership) => {
        const activation = activationByUserId.get(membership.userId);
        return {
          id: membership.id,
          userId: membership.userId,
          displayName: toDisplayName(
            membership.user.person.givenName,
            membership.user.person.familyName,
          ),
          kind: "HOSPITAL_MEMBER" as const,
          profession: membership.profession,
          relationshipStatus: membership.status,
          accountStatus: membership.user.status,
          activationRequired: membership.user.status === UserStatus.PROVISIONED,
          activationExpiresAt: activation?.expiresAt ?? null,
          activationMode: activation ? toWorkforceActivationMode(activation.mode) : null,
        };
      }),
      ...osmRelationships.map((relationship) => {
        const activation = activationByUserId.get(relationship.userId);
        return {
          id: relationship.id,
          userId: relationship.userId,
          displayName: toDisplayName(
            relationship.user.person.givenName,
            relationship.user.person.familyName,
          ),
          kind: "OSM" as const,
          profession: null,
          relationshipStatus: relationship.status,
          accountStatus: relationship.user.status,
          activationRequired: relationship.user.status === UserStatus.PROVISIONED,
          activationExpiresAt: activation?.expiresAt ?? null,
          activationMode: activation ? toWorkforceActivationMode(activation.mode) : null,
        };
      }),
    ];

    return { hospital, rows };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    throw new InfrastructureError("Workforce data could not be loaded");
  }
}

async function regenerateActivationInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    request: WorkforceActivationRequestInput;
    now: Date;
    dependencies: WorkforceServiceDependencies;
  },
): Promise<{
  userId: string;
  hospitalId: string;
  kind: WorkforceKind;
  activationToken: string;
  activationExpiresAt: Date;
  activationMode: WorkforceActivationModeValue;
}> {
  await assertOwnerInDatabase(transaction, input.actorUserId, input.request.targetHospitalId);

  const user = await transaction.user.findUnique({
    where: { id: input.request.userId },
    select: { id: true, status: true, authSubject: true },
  });

  if (!user) {
    throw new NotFoundError("The workforce account was not found");
  }

  if (user.status !== UserStatus.PROVISIONED || user.authSubject) {
    throw new ConflictError("Only a non-active workforce account can be regenerated");
  }

  await assertActivationTargetRelationship(transaction, input.request);

  const current = await findCurrentActivation(transaction, user.id);

  if (current?.claimedAt) {
    throw new ConflictError("The activation credential is currently being used");
  }

  if (current) {
    const revoked = await transaction.workforceActivation.updateMany({
      where: {
        id: current.id,
        userId: user.id,
        claimedAt: null,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: input.now,
      },
    });

    if (revoked.count !== 1) {
      throw new ConflictError("The activation credential changed during regeneration");
    }

    await recordAuditEvent(
      {
        actorUserId: input.actorUserId,
        action: "workforce_activation.revoked",
        resourceType: "WorkforceActivation",
        resourceId: current.id,
        metadata: { source: "explicit_regeneration" },
      },
      transaction,
    );
  }

  const credential = (input.dependencies.generateCredential ??
    generateWorkforceActivationCredential)();
  const prismaMode = toPrismaActivationMode(input.request.mode);
  const expiresAt = getWorkforceActivationExpiry(input.now, input.request.mode);
  const activation = await transaction.workforceActivation.create({
    data: {
      userId: user.id,
      tokenHash: credential.tokenHash,
      mode: prismaMode,
      expiresAt,
      createdByUserId: input.actorUserId,
    },
    select: { id: true },
  });

  await recordAuditEvent(
    {
      actorUserId: input.actorUserId,
      action: "workforce_activation.issued",
      resourceType: "WorkforceActivation",
      resourceId: activation.id,
      metadata: {
        mode: prismaMode,
        status: UserStatus.PROVISIONED,
        source: "explicit_regeneration",
      },
    },
    transaction,
  );

  return {
    userId: user.id,
    hospitalId: input.request.targetHospitalId,
    kind: input.request.kind,
    activationToken: credential.plaintextToken,
    activationExpiresAt: expiresAt,
    activationMode: input.request.mode,
  };
}

export async function regenerateWorkforceActivation(
  actor: ActorContext | null | undefined,
  input: WorkforceActivationRequestInput,
  dependencies: WorkforceServiceDependencies = {},
): Promise<{
  userId: string;
  hospitalId: string;
  kind: WorkforceKind;
  activationToken: string;
  activationExpiresAt: Date;
  activationMode: WorkforceActivationModeValue;
}> {
  const parsed = workforceActivationRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Activation regeneration data is invalid");
  }

  assertActorPolicy(
    actor,
    parsed.data.kind === "OSM"
      ? WORKFORCE_CAPABILITIES.osmProvision
      : WORKFORCE_CAPABILITIES.create,
    parsed.data.targetHospitalId,
  );

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) =>
        regenerateActivationInTransaction(transaction, {
          actorUserId: actor!.userId,
          request: parsed.data,
          now: getNow(dependencies),
          dependencies,
        }),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Activation regeneration could not be completed");
  }
}

export async function revokeWorkforceActivation(
  actor: ActorContext | null | undefined,
  input: Omit<WorkforceActivationRequestInput, "mode">,
  dependencies: WorkforceServiceDependencies = {},
): Promise<void> {
  const parsed = workforceActivationRequestSchema.safeParse({ ...input, mode: "REMOTE" });

  if (!parsed.success) {
    throw new ValidationError("Activation revocation data is invalid");
  }

  const capability =
    parsed.data.kind === "OSM"
      ? WORKFORCE_CAPABILITIES.osmProvision
      : WORKFORCE_CAPABILITIES.create;
  assertActorPolicy(actor, capability, parsed.data.targetHospitalId);

  try {
    await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertOwnerInDatabase(
          transaction,
          actor!.userId,
          parsed.data.targetHospitalId,
        );

        const user = await transaction.user.findUnique({
          where: { id: parsed.data.userId },
          select: { id: true, status: true, authSubject: true },
        });

        if (!user || user.status !== UserStatus.PROVISIONED || user.authSubject) {
          throw new ConflictError("Only a non-active workforce account can be revoked");
        }

        await assertActivationTargetRelationship(transaction, parsed.data);

        const current = await findCurrentActivation(transaction, user.id);

        if (!current) {
          return;
        }

        if (current.claimedAt) {
          throw new ConflictError("The activation credential is currently being used");
        }

        const revoked = await transaction.workforceActivation.updateMany({
          where: {
            id: current.id,
            userId: user.id,
            claimedAt: null,
            usedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: getNow(dependencies) },
        });

        if (revoked.count !== 1) {
          throw new ConflictError("The activation credential changed during revocation");
        }

        await recordAuditEvent(
          {
            actorUserId: actor!.userId,
            action: "workforce_activation.revoked",
            resourceType: "WorkforceActivation",
            resourceId: current.id,
            metadata: { source: "assisted_handoff_failure" },
          },
          transaction,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Activation revocation could not be completed");
  }
}

async function claimWorkforceActivation(
  token: string,
  dependencies: WorkforceServiceDependencies,
): Promise<ActivationClaim> {
  const tokenHash = hashWorkforceActivationToken(token);
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  try {
    return await runSerializable(
      database,
      async (transaction) => {
        const activation = await transaction.workforceActivation.findUnique({
          where: { tokenHash },
          select: {
            id: true,
            userId: true,
            tokenHash: true,
            expiresAt: true,
            claimedAt: true,
            usedAt: true,
            revokedAt: true,
          },
        });

        if (
          !activation ||
          activation.usedAt ||
          activation.revokedAt ||
          activation.claimedAt ||
          activation.expiresAt <= now
        ) {
          throw new ConflictError("ลิงก์เปิดใช้งานไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว");
        }

        const user = await transaction.user.findUnique({
          where: { id: activation.userId },
          select: {
            status: true,
            authSubject: true,
            memberships: {
              where: {
                membershipType: MembershipType.MEMBER,
                status: MembershipStatus.PROVISIONED,
                hospital: { status: HospitalStatus.ACTIVE },
              },
              select: { id: true },
            },
            osmHospitalRelationships: {
              where: {
                status: MembershipStatus.PROVISIONED,
                hospital: { status: HospitalStatus.ACTIVE },
              },
              select: { id: true },
            },
          },
        });

        if (
          !user ||
          user.status !== UserStatus.PROVISIONED ||
          user.authSubject ||
          user.memberships.length + user.osmHospitalRelationships.length === 0
        ) {
          throw new ConflictError("บัญชีนี้ไม่อยู่ในสถานะที่เปิดใช้งานได้");
        }

        const claimedAt = now;
        const claimed = await transaction.workforceActivation.updateMany({
          where: {
            id: activation.id,
            tokenHash,
            claimedAt: null,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { claimedAt },
        });

        if (claimed.count !== 1) {
          throw new ConflictError("ลิงก์เปิดใช้งานกำลังถูกใช้งานหรือไม่สามารถใช้งานได้");
        }

        return { activationId: activation.id, userId: activation.userId, claimedAt };
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      throw error;
    }

    throw normalizeDatabaseError(error, "Workforce activation could not be claimed");
  }
}

async function releaseWorkforceActivationClaim(
  claim: ActivationClaim,
  dependencies: WorkforceServiceDependencies,
): Promise<void> {
  try {
    const result = await getDatabase(dependencies).workforceActivation.updateMany({
      where: {
        id: claim.activationId,
        userId: claim.userId,
        claimedAt: claim.claimedAt,
        usedAt: null,
        revokedAt: null,
      },
      data: { claimedAt: null },
    });

    if (result.count !== 1) {
      throw new WorkforceActivationReconciliationError();
    }
  } catch (error: unknown) {
    if (error instanceof WorkforceActivationReconciliationError) {
      throw error;
    }

    throw new WorkforceActivationReconciliationError();
  }
}

async function finalizeWorkforceActivationLocally(
  claim: ActivationClaim,
  authSubject: string,
  dependencies: WorkforceServiceDependencies,
): Promise<void> {
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  await runSerializable(
    database,
    async (transaction) => {
      const activation = await transaction.workforceActivation.findUnique({
        where: { id: claim.activationId },
        select: {
          id: true,
          userId: true,
          claimedAt: true,
          usedAt: true,
          revokedAt: true,
        },
      });

      const user = await transaction.user.findUnique({
        where: { id: claim.userId },
        select: { id: true, status: true, authSubject: true },
      });

      if (
        !activation ||
        activation.userId !== claim.userId ||
        activation.claimedAt?.getTime() !== claim.claimedAt.getTime() ||
        activation.usedAt ||
        activation.revokedAt ||
        !user ||
        user.status !== UserStatus.PROVISIONED ||
        user.authSubject !== authSubject
      ) {
        throw new ConflictError("Workforce activation state changed before completion");
      }

      const activatedMemberships = await transaction.hospitalMembership.updateMany({
        where: {
          userId: claim.userId,
          membershipType: MembershipType.MEMBER,
          status: MembershipStatus.PROVISIONED,
          hospital: { status: HospitalStatus.ACTIVE },
        },
        data: { status: MembershipStatus.ACTIVE },
      });
      const activatedOsmRelationships = await transaction.osmHospitalRelationship.updateMany({
        where: {
          userId: claim.userId,
          status: MembershipStatus.PROVISIONED,
          hospital: { status: HospitalStatus.ACTIVE },
        },
        data: { status: MembershipStatus.ACTIVE },
      });

      if (activatedMemberships.count + activatedOsmRelationships.count === 0) {
        throw new ConflictError("No workforce relationship is awaiting activation");
      }

      const activatedUser = await transaction.user.updateMany({
        where: {
          id: claim.userId,
          status: UserStatus.PROVISIONED,
          authSubject,
        },
        data: { status: UserStatus.ACTIVE },
      });

      if (activatedUser.count !== 1) {
        throw new ConflictError("Workforce account changed during activation");
      }

      const consumed = await transaction.workforceActivation.updateMany({
        where: {
          id: claim.activationId,
          userId: claim.userId,
          claimedAt: claim.claimedAt,
          usedAt: null,
          revokedAt: null,
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new ConflictError("Workforce activation credential changed during completion");
      }

      await recordAuditEvent(
        {
          actorUserId: null,
          action: "workforce_activation.completed",
          resourceType: "User",
          resourceId: claim.userId,
          metadata: {
            status: UserStatus.ACTIVE,
            source: "workforce_activation",
          },
        },
        transaction,
      );
    },
    dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
  );
}

async function deleteProviderIdentityByDefault(authSubject: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authSubject);

    if (error) {
      throw error;
    }
  } catch {
    throw new WorkforceActivationReconciliationError();
  }
}

async function detachAuthSubjectFromDatabase(
  database: WorkforceDatabase,
  input: { userId: string; authSubject: string },
): Promise<boolean> {
  try {
    const result = await database.user.updateMany({
      where: {
        id: input.userId,
        authSubject: input.authSubject,
        status: UserStatus.PROVISIONED,
      },
      data: { authSubject: null },
    });

    return result.count === 1;
  } catch {
    throw new WorkforceActivationReconciliationError();
  }
}

async function compensateFailedWorkforceFinalization(
  claim: ActivationClaim,
  authSubject: string,
  dependencies: WorkforceServiceDependencies,
): Promise<void> {
  const detachAuthSubject =
    dependencies.detachAuthSubject ??
    ((input: { userId: string; authSubject: string }) =>
      detachAuthSubjectFromDatabase(getDatabase(dependencies), input));
  const detached = await detachAuthSubject({ userId: claim.userId, authSubject });

  if (!detached) {
    throw new WorkforceActivationReconciliationError();
  }

  const deleteProviderIdentity =
    dependencies.deleteProviderIdentity ?? deleteProviderIdentityByDefault;
  await deleteProviderIdentity(authSubject);
}

export async function completeWorkforceActivation(
  token: string,
  input: WorkforceActivationCompletionInput,
  dependencies: WorkforceServiceDependencies = {},
): Promise<{ userId: string }> {
  const parsedToken = workforceActivationTokenSchema.safeParse(token);
  const parsedInput = workforceActivationCompletionSchema.safeParse(input);

  if (!parsedToken.success || !parsedInput.success) {
    throw new ValidationError("Workforce activation data is invalid");
  }

  const claim = await claimWorkforceActivation(parsedToken.data, dependencies);
  const provisionIdentity = dependencies.provisionIdentity ?? provisionPasswordAuthIdentity;
  let provisionedIdentity: ProvisionPasswordAuthIdentityResult;

  try {
    provisionedIdentity = await provisionIdentity({
      userId: claim.userId,
      password: parsedInput.data.password,
    });
  } catch (error: unknown) {
    if (error instanceof PasswordAuthProvisioningReconciliationError) {
      throw new WorkforceActivationReconciliationError();
    }

    await releaseWorkforceActivationClaim(claim, dependencies);
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Authentication provider could not establish the account");
  }

  if (provisionedIdentity.userId !== claim.userId || !zUuid(provisionedIdentity.authSubject)) {
    throw new WorkforceActivationReconciliationError();
  }

  try {
    await finalizeWorkforceActivationLocally(claim, provisionedIdentity.authSubject, dependencies);
  } catch (error: unknown) {
    try {
      await compensateFailedWorkforceFinalization(
        claim,
        provisionedIdentity.authSubject,
        dependencies,
      );
    } catch (compensationError: unknown) {
      if (compensationError instanceof WorkforceActivationReconciliationError) {
        throw compensationError;
      }

      throw new WorkforceActivationReconciliationError();
    }

    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Workforce activation could not be finalized");
  }

  return { userId: claim.userId };
}
