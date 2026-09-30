import "server-only";

import { AccountRecoveryDeliveryChannel, HospitalStatus, MembershipStatus, MembershipType, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { findPersonByIdentity } from "@/modules/identity/services/identity-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import { replacePasswordAndRevokeRecoverySessions } from "../adapters/supabase-account-security-provider";
import { decideAccountRecoveryIssuePolicy } from "../policies/account-recovery-policy";
import {
  accountRecoveryCompletionSchema,
  accountRecoveryIssueSchema,
  accountRecoveryTokenSchema,
  patientHospitalRelationshipIdSchema,
} from "../schemas/account-security-schemas";
import { hashAccountRecoveryToken, createAccountRecoveryToken } from "./account-recovery-token-service";

export const ACCOUNT_RECOVERY_TTL_MS = 15 * 60 * 1000;
export const ACCOUNT_RECOVERY_ISSUANCE_WINDOW_MS = 60 * 60 * 1000;
export const ACCOUNT_RECOVERY_MAX_ISSUANCES_PER_WINDOW = 5;

export type AccountRecoveryDatabase = PrismaClient;

export type AccountRecoveryDeliveryResult = {
  handoffUrl?: string;
};

export type AccountRecoveryDeliveryAdapter = {
  channel: AccountRecoveryDeliveryChannel;
  deliver(recoveryUrl: string): Promise<AccountRecoveryDeliveryResult>;
};

export type AccountRecoveryProvider = (input: {
  userId: string;
  authSubject: string;
  newPassword: string;
}) => Promise<void>;

export type AccountRecoveryDependencies = {
  database?: AccountRecoveryDatabase;
  findPerson?: (nationalId: string) => Promise<{ id: string } | null>;
  createToken?: () => string;
  now?: () => Date;
  delivery?: AccountRecoveryDeliveryAdapter;
  replacePasswordAndRevokeSessions?: AccountRecoveryProvider;
};

const assistedAccountRecoveryDeliveryAdapter: AccountRecoveryDeliveryAdapter = {
  channel: AccountRecoveryDeliveryChannel.ASSISTED,
  async deliver(recoveryUrl): Promise<AccountRecoveryDeliveryResult> {
    return { handoffUrl: recoveryUrl };
  },
};

function getDatabase(database?: AccountRecoveryDatabase): AccountRecoveryDatabase {
  return database ?? getPrisma();
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isEligibleTarget(input: {
  id: string;
  personId: string;
  authSubject: string | null;
  status: UserStatus;
  roles: readonly { role: Role }[];
}): input is typeof input & { authSubject: string } {
  return (
    input.status === UserStatus.ACTIVE &&
    Boolean(input.authSubject?.trim()) &&
    input.roles.some(({ role }) => role === Role.PATIENT)
  );
}

export async function issuePatientAccountRecovery(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  input: unknown,
  dependencies: AccountRecoveryDependencies = {},
): Promise<{
  recoveryId: string;
  deliveryChannel: AccountRecoveryDeliveryChannel;
  expiresAt: Date;
  handoffUrl?: string;
}> {
  if (!actor || !actor.userId.trim() || !actor.roles.includes(Role.HOSPITAL)) {
    throw new ForbiddenError("Account recovery could not be issued");
  }

  const parsedRelationshipId = patientHospitalRelationshipIdSchema.safeParse(relationshipId);
  const parsedInput = accountRecoveryIssueSchema.safeParse(input);

  if (!parsedRelationshipId.success || !parsedInput.success) {
    throw new ValidationError("Account recovery request is invalid");
  }

  const findPerson = dependencies.findPerson ?? (async (nationalId) => {
    const person = await findPersonByIdentity({
      namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
      value: nationalId,
    });
    return person ? { id: person.id } : null;
  });
  const database = getDatabase(dependencies.database);
  let authorizedTarget: { hospitalId: string } | null;

  try {
    authorizedTarget = await database.patientHospitalRelationship.findFirst({
      where: {
        id: parsedRelationshipId.data.toLowerCase(),
        hospital: {
          status: HospitalStatus.ACTIVE,
          memberships: {
            some: {
              userId: actor.userId,
              membershipType: MembershipType.OWNER,
              status: MembershipStatus.ACTIVE,
              user: {
                status: UserStatus.ACTIVE,
                roles: { some: { role: Role.HOSPITAL } },
              },
            },
          },
        },
      },
      select: { hospitalId: true },
    });
  } catch {
    throw new InfrastructureError("Account recovery request could not be issued");
  }

  if (
    !authorizedTarget ||
    !decideAccountRecoveryIssuePolicy(actor, authorizedTarget.hospitalId).allowed
  ) {
    throw new ForbiddenError("Account recovery could not be issued");
  }

  let identityPerson: { id: string } | null;

  try {
    identityPerson = await findPerson(parsedInput.data.nationalId);
  } catch {
    throw new InfrastructureError("Account recovery request could not be issued");
  }

  if (!identityPerson) {
    throw new ForbiddenError("Account recovery could not be issued");
  }

  const now = dependencies.now?.() ?? new Date();
  const token = (dependencies.createToken ?? createAccountRecoveryToken)();
  const tokenHash = hashAccountRecoveryToken(token);
  const expiresAt = new Date(now.getTime() + ACCOUNT_RECOVERY_TTL_MS);
  const delivery = dependencies.delivery ?? assistedAccountRecoveryDeliveryAdapter;
  let issued: { id: string; targetUserId: string };

  try {
    issued = await database.$transaction(
      async (transaction) => {
        const relationship = await transaction.patientHospitalRelationship.findFirst({
          where: {
            id: parsedRelationshipId.data.toLowerCase(),
            hospital: {
              status: HospitalStatus.ACTIVE,
              memberships: {
                some: {
                  userId: actor.userId,
                  membershipType: MembershipType.OWNER,
                  status: MembershipStatus.ACTIVE,
                  user: {
                    status: UserStatus.ACTIVE,
                    roles: { some: { role: Role.HOSPITAL } },
                  },
                },
              },
            },
          },
          select: {
            id: true,
            hospitalId: true,
            patientProfile: {
              select: {
                personId: true,
                person: {
                  select: {
                    id: true,
                    user: {
                      select: {
                        id: true,
                        personId: true,
                        authSubject: true,
                        status: true,
                        roles: { select: { role: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!relationship) {
          throw new ForbiddenError("Account recovery could not be issued");
        }

        const policy = decideAccountRecoveryIssuePolicy(actor, relationship.hospitalId);

        if (!policy.allowed) {
          throw new ForbiddenError("Account recovery could not be issued");
        }

        const targetUser = relationship.patientProfile.person.user;

        if (
          !targetUser ||
          relationship.patientProfile.person.id !== identityPerson.id ||
          relationship.patientProfile.personId !== identityPerson.id ||
          targetUser.personId !== identityPerson.id ||
          !isEligibleTarget(targetUser)
        ) {
          throw new ForbiddenError("Account recovery could not be issued");
        }

        const unresolved = await transaction.accountRecovery.findMany({
          where: {
            targetUserId: targetUser.id,
            completedAt: null,
            revokedAt: null,
          },
          select: {
            id: true,
            claimedAt: true,
          },
        });

        if (unresolved.some((recovery) => recovery.claimedAt !== null)) {
          throw new ConflictError("Account recovery needs reconciliation");
        }

        const recentIssuances = await transaction.accountRecovery.count({
          where: {
            targetUserId: targetUser.id,
            createdAt: { gte: new Date(now.getTime() - ACCOUNT_RECOVERY_ISSUANCE_WINDOW_MS) },
          },
        });

        if (recentIssuances >= ACCOUNT_RECOVERY_MAX_ISSUANCES_PER_WINDOW) {
          throw new ConflictError("Account recovery issuance limit was reached");
        }

        if (unresolved.length > 0) {
          const revoked = await transaction.accountRecovery.updateMany({
            where: {
              targetUserId: targetUser.id,
              completedAt: null,
              revokedAt: null,
              claimedAt: null,
            },
            data: { revokedAt: now },
          });

          if (revoked.count === unresolved.length) {
            for (const previousRecovery of unresolved) {
              await recordAuditEvent(
                {
                  actorUserId: actor.userId,
                  action: "ACCOUNT_RECOVERY_REVOKED",
                  resourceType: "ACCOUNT_RECOVERY",
                  resourceId: previousRecovery.id,
                  metadata: { reason: "SUPERSEDED" },
                },
                transaction,
              );
            }
          } else {
            throw new ConflictError("Account recovery capability changed before reissue");
          }
        }

        const recovery = await transaction.accountRecovery.create({
          data: {
            targetUserId: targetUser.id,
            patientHospitalRelationshipId: relationship.id,
            issuedByUserId: actor.userId,
            tokenHash,
            deliveryChannel: delivery.channel,
            expiresAt,
          },
          select: { id: true, targetUserId: true },
        });

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: "ACCOUNT_RECOVERY_ISSUED",
            resourceType: "ACCOUNT_RECOVERY",
            resourceId: recovery.id,
            metadata: {
              channel: delivery.channel,
              identityVerified: true,
              expiresAt: expiresAt.toISOString(),
            },
          },
          transaction,
        );

        return recovery;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    if (
      error instanceof ForbiddenError ||
      error instanceof ConflictError ||
      error instanceof ValidationError
    ) {
      throw error;
    }

    if (isPrismaCode(error, "P2002") || isPrismaCode(error, "P2034")) {
      throw new ConflictError("Account recovery request could not be issued");
    }

    throw new InfrastructureError("Account recovery request could not be issued");
  }

  const recoveryPath = `/recover#${token}`;
  let deliveryResult: AccountRecoveryDeliveryResult;

  try {
    deliveryResult = await delivery.deliver(recoveryPath);
  } catch {
    try {
      await database.accountRecovery.updateMany({
        where: { id: issued.id, claimedAt: null, completedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "ACCOUNT_RECOVERY_REVOKED",
        resourceType: "ACCOUNT_RECOVERY",
        resourceId: issued.id,
        metadata: { reason: "DELIVERY_FAILED" },
      });
    } catch {
      console.error("Account recovery delivery failed and its capability needs reconciliation");
    }

    throw new InfrastructureError("Account recovery request could not be issued");
  }

  return {
    recoveryId: issued.id,
    deliveryChannel: delivery.channel,
    expiresAt,
    ...(deliveryResult.handoffUrl ? { handoffUrl: deliveryResult.handoffUrl } : {}),
  };
}

export async function getPatientAccountRecoveryAvailability(
  token: unknown,
  dependencies: Pick<AccountRecoveryDependencies, "database" | "now"> = {},
): Promise<{ expiresAt: Date }> {
  const parsedToken = accountRecoveryTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    throw new ConflictError("Recovery link is invalid or expired");
  }

  const now = dependencies.now?.() ?? new Date();

  try {
    const recovery = await getDatabase(dependencies.database).accountRecovery.findUnique({
      where: { tokenHash: hashAccountRecoveryToken(parsedToken.data) },
      select: {
        expiresAt: true,
        claimedAt: true,
        completedAt: true,
        reconciliationRequiredAt: true,
        revokedAt: true,
        targetUser: {
          select: {
            personId: true,
            authSubject: true,
            status: true,
            roles: { select: { role: true } },
          },
        },
        relationship: {
          select: {
            patientProfile: { select: { personId: true } },
          },
        },
      },
    });

    if (
      !recovery ||
      recovery.expiresAt <= now ||
      recovery.claimedAt ||
      recovery.completedAt ||
      recovery.reconciliationRequiredAt ||
      recovery.revokedAt ||
      recovery.targetUser.status !== UserStatus.ACTIVE ||
      !recovery.targetUser.authSubject ||
      !recovery.targetUser.roles.some(({ role }) => role === Role.PATIENT) ||
      recovery.targetUser.personId !== recovery.relationship.patientProfile.personId
    ) {
      throw new ConflictError("Recovery link is invalid or expired");
    }

    return { expiresAt: recovery.expiresAt };
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      throw error;
    }

    throw new InfrastructureError("Recovery availability could not be checked");
  }
}

export async function completePatientAccountRecovery(
  input: unknown,
  dependencies: AccountRecoveryDependencies = {},
): Promise<void> {
  const parsedInput = accountRecoveryCompletionSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new ValidationError("Account recovery completion data is invalid");
  }

  const database = getDatabase(dependencies.database);
  const tokenHash = hashAccountRecoveryToken(parsedInput.data.token);
  const now = dependencies.now?.() ?? new Date();
  const claim = await database.$transaction(
    async (transaction) => {
      const recovery = await transaction.accountRecovery.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          targetUserId: true,
          expiresAt: true,
          claimedAt: true,
          completedAt: true,
          reconciliationRequiredAt: true,
          revokedAt: true,
          targetUser: {
            select: {
              id: true,
              personId: true,
              authSubject: true,
              status: true,
              roles: { select: { role: true } },
            },
          },
          relationship: {
            select: {
              patientProfile: { select: { personId: true } },
            },
          },
        },
      });

      if (
        !recovery ||
        recovery.expiresAt <= now ||
        recovery.claimedAt ||
        recovery.completedAt ||
        recovery.reconciliationRequiredAt ||
        recovery.revokedAt ||
        recovery.targetUser.status !== UserStatus.ACTIVE ||
        !recovery.targetUser.authSubject ||
        !recovery.targetUser.roles.some(({ role }) => role === Role.PATIENT) ||
        recovery.targetUser.personId !== recovery.relationship.patientProfile.personId
      ) {
        throw new ConflictError("Recovery link is invalid or expired");
      }

      const claimed = await transaction.accountRecovery.updateMany({
        where: {
          id: recovery.id,
          tokenHash,
          claimedAt: null,
          completedAt: null,
          reconciliationRequiredAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { claimedAt: now },
      });

      if (claimed.count !== 1) {
        throw new ConflictError("Recovery link is invalid or expired");
      }

      return {
        id: recovery.id,
        targetUserId: recovery.targetUser.id,
        authSubject: recovery.targetUser.authSubject,
        claimedAt: now,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  const replacePassword =
    dependencies.replacePasswordAndRevokeSessions ?? replacePasswordAndRevokeRecoverySessions;

  try {
    await replacePassword({
      userId: claim.targetUserId,
      authSubject: claim.authSubject,
      newPassword: parsedInput.data.newPassword,
    });
  } catch {
    await requireReconciliation(database, claim.id, new Date());
    throw new InfrastructureError("Account recovery could not be completed");
  }

  try {
    await database.$transaction(
      async (transaction) => {
        const completed = await transaction.accountRecovery.updateMany({
          where: {
            id: claim.id,
            claimedAt: claim.claimedAt,
            completedAt: null,
            reconciliationRequiredAt: null,
            revokedAt: null,
          },
          data: { completedAt: new Date() },
        });

        if (completed.count !== 1) {
          throw new ConflictError("Recovery completion could not be stored");
        }

        await recordAuditEvent(
          {
            actorUserId: null,
            action: "ACCOUNT_RECOVERY_COMPLETED",
            resourceType: "ACCOUNT_RECOVERY",
            resourceId: claim.id,
          },
          transaction,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch {
    await requireReconciliation(database, claim.id, new Date());
    throw new InfrastructureError("Account recovery could not be completed");
  }
}

async function requireReconciliation(
  database: AccountRecoveryDatabase,
  recoveryId: string,
  now: Date,
): Promise<void> {
  try {
    await database.$transaction(async (transaction) => {
      const updated = await transaction.accountRecovery.updateMany({
        where: {
          id: recoveryId,
          claimedAt: { not: null },
          completedAt: null,
          revokedAt: null,
        },
        data: { reconciliationRequiredAt: now },
      });

      if (updated.count === 1) {
        await recordAuditEvent(
          {
            actorUserId: null,
            action: "ACCOUNT_RECOVERY_RECONCILIATION_REQUIRED",
            resourceType: "ACCOUNT_RECOVERY",
            resourceId: recoveryId,
            metadata: { stage: "PROVIDER_OR_COMPLETION" },
          },
          transaction,
        );
      }
    });
  } catch {
    console.error("Account recovery provider result needs reconciliation");
  }
}

export const accountRecoveryInternals = {
  assistedAccountRecoveryDeliveryAdapter,
  isEligibleTarget,
};
