import "server-only";

import {
  MembershipStatus,
  MembershipType,
  Prisma,
  UserStatus,
  UserTakeoverProviderState,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import {
  revokeProviderSessionsBySuspension,
  type ProviderSessionRevocationOutcome,
} from "@/modules/account-security/adapters/supabase-account-security-provider";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { lockFirstCredentialOperation } from "@/modules/identity/services/first-credential-serialization";
import { unlinkLineBindingForSuspectedTakeover } from "@/modules/line/services/line-account-service";
import { personHospitalIds } from "@/modules/patient-hospital-profile/services/patient-name-correction-service";
import { assertOwnerInDatabase } from "@/modules/workforce/services/workforce-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import { credentialEstablishedAt, type UsedActivation, type UserKind } from "../domain/user-management-values";
import { suspectedTakeoverLockSchema } from "../schemas/user-management-schemas";

export type UserTakeoverDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  revokeProviderSessions?: (authSubject: string) => Promise<ProviderSessionRevocationOutcome>;
};

export type UserTakeoverLockResult = {
  providerState: UserTakeoverProviderState;
  alreadyLocked: boolean;
};

/** UM-D5 with UM-1 decision 2: the lock is global, so only a Person related to this Hospital alone qualifies. */
export class UserTakeoverRequiresAdminError extends ForbiddenError {
  constructor() {
    super("The account relates to another Hospital; a platform ADMIN must lock it");
    this.name = "UserTakeoverRequiresAdminError";
  }
}

export class UserTakeoverNotEligibleError extends ConflictError {
  constructor(readonly reason: "NOT_ACTIVATED" | "REMOVED" | "OWNER_MEMBERSHIP") {
    super("The account cannot be locked as a suspected takeover");
    this.name = "UserTakeoverNotEligibleError";
  }
}

const userSelect = {
  id: true,
  status: true,
  authSubject: true,
  takeoverLock: { select: { id: true, hospitalId: true, providerState: true } },
  person: { select: { patientProfile: { select: { id: true } } } },
  workforceActivations: { where: { usedAt: { not: null } }, select: { purpose: true, mode: true, usedAt: true } },
  patientActivations: { where: { usedAt: { not: null } }, select: { purpose: true, usedAt: true } },
} as const satisfies Prisma.UserSelect;

async function locateTarget(transaction: Prisma.TransactionClient, kind: UserKind, hospitalId: string, relationshipId: string) {
  if (kind === "patient") {
    const row = await transaction.patientHospitalRelationship.findFirst({
      where: { id: relationshipId, hospitalId },
      select: { updatedAt: true, endedAt: true, patientProfile: { select: { person: { select: { user: { select: userSelect } } } } } },
    });
    const user = row?.patientProfile.person.user;
    return row && user ? { updatedAt: row.updatedAt, removed: row.endedAt !== null, ownerMembership: false, user } : null;
  }
  const row = kind === "staff"
    ? await transaction.hospitalMembership.findFirst({
        where: { id: relationshipId, hospitalId },
        select: { updatedAt: true, status: true, membershipType: true, user: { select: userSelect } },
      })
    : await transaction.osmHospitalRelationship.findFirst({
        where: { id: relationshipId, hospitalId },
        select: { updatedAt: true, status: true, user: { select: userSelect } },
      });
  return row
    ? {
        updatedAt: row.updatedAt,
        removed: row.status === MembershipStatus.ENDED,
        ownerMembership: "membershipType" in row && row.membershipType === MembershipType.OWNER,
        user: row.user,
      }
    : null;
}

function usedActivationsOf(user: Prisma.UserGetPayload<{ select: typeof userSelect }>): UsedActivation[] {
  return [
    ...user.workforceActivations.map((activation) => ({ source: "WORKFORCE" as const, ...activation, usedAt: activation.usedAt! })),
    ...user.patientActivations.map((activation) => ({ source: "PATIENT" as const, ...activation, usedAt: activation.usedAt! })),
  ];
}

/**
 * UM-D5 "บัญชีนี้ไม่ใช่เจ้าของจริง". One transaction: the User becomes SUSPENDED (every access path requires ACTIVE,
 * so this Hospital's data — and any other — stops on the next request), this Hospital's ACTIVE staff/OSM
 * relationships become SUSPENDED (a Patient relationship has no suspension; the account lock is what blocks it),
 * unused activation links are revoked, a LINE binding made after the first credential is unlinked, and the lock
 * row plus an audit are written. Then, outside every database lock, the provider revokes sessions; anything but a
 * confirmed result leaves the lock in RECONCILIATION_REQUIRED (quarantine). Repeating the action only retries the
 * provider step. The lock is terminal for an OWNER (UM-1 decision 3).
 */
export async function lockSuspectedTakeover(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: UserTakeoverDependencies = {},
): Promise<UserTakeoverLockResult> {
  if (!actor) throw new ForbiddenError();
  const parsed = suspectedTakeoverLockSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Suspected takeover data is invalid");
  const { kind, relationshipId, targetHospitalId, expectedUpdatedAt } = parsed.data;
  const database = dependencies.database ?? getPrisma();
  const now = () => dependencies.now?.() ?? new Date();

  let locked: { lockId: string; userId: string; authSubject: string | null; providerState: UserTakeoverProviderState; alreadyLocked: boolean };
  try {
    locked = await runSerializableTransaction(database, async (transaction) => {
      await assertOwnerInDatabase(transaction, actor.userId, targetHospitalId);
      const target = await locateTarget(transaction, kind, targetHospitalId, relationshipId);
      if (!target) throw new NotFoundError();
      if (target.user.id === actor.userId) throw new ForbiddenError();

      const existing = target.user.takeoverLock;
      if (existing) {
        if (existing.hospitalId !== targetHospitalId) throw new UserTakeoverRequiresAdminError();
        return { lockId: existing.id, userId: target.user.id, authSubject: target.user.authSubject, providerState: existing.providerState, alreadyLocked: true };
      }

      if (target.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) throw new ConflictError("The record changed");
      if (target.removed) throw new UserTakeoverNotEligibleError("REMOVED");
      if (target.ownerMembership) throw new UserTakeoverNotEligibleError("OWNER_MEMBERSHIP");
      if (target.user.status !== UserStatus.ACTIVE || !target.user.authSubject) throw new UserTakeoverNotEligibleError("NOT_ACTIVATED");
      const hospitals = new Set(await personHospitalIds(transaction, target.user.person.patientProfile?.id ?? null, target.user.id));
      if (hospitals.size !== 1 || !hospitals.has(targetHospitalId)) throw new UserTakeoverRequiresAdminError();

      await lockFirstCredentialOperation(transaction, target.user.id);
      const at = now();
      const suspendedUser = await transaction.user.updateMany({
        where: { id: target.user.id, status: UserStatus.ACTIVE },
        data: { status: UserStatus.SUSPENDED },
      });
      if (suspendedUser.count !== 1) throw new ConflictError("The account changed");

      const activeHere = { userId: target.user.id, hospitalId: targetHospitalId, status: MembershipStatus.ACTIVE };
      const [memberships, osmRelationships] = await Promise.all([
        transaction.hospitalMembership.updateMany({ where: { ...activeHere, membershipType: MembershipType.MEMBER }, data: { status: MembershipStatus.SUSPENDED } }),
        transaction.osmHospitalRelationship.updateMany({ where: activeHere, data: { status: MembershipStatus.SUSPENDED } }),
      ]);
      const unused = { userId: target.user.id, usedAt: null, revokedAt: null, claimedAt: null };
      const [workforceActivations, patientActivations] = await Promise.all([
        transaction.workforceActivation.updateMany({ where: unused, data: { revokedAt: at } }),
        transaction.patientActivation.updateMany({ where: unused, data: { revokedAt: at, claimExpiresAt: null } }),
      ]);
      const lineBindingsUnlinked = await unlinkLineBindingForSuspectedTakeover(transaction, {
        userId: target.user.id,
        actorUserId: actor.userId,
        hospitalId: targetHospitalId,
        credentialEstablishedAt: credentialEstablishedAt(usedActivationsOf(target.user)),
        now: at,
      });
      const lock = await transaction.userTakeoverLock.create({
        data: { userId: target.user.id, hospitalId: targetHospitalId, lockedByUserId: actor.userId, lockedAt: at },
        select: { id: true },
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "user.takeover_locked",
        resourceType: "User",
        resourceId: target.user.id,
        metadata: {
          hospitalId: targetHospitalId,
          kind,
          relationshipsSuspended: memberships.count + osmRelationships.count,
          activationsRevoked: workforceActivations.count + patientActivations.count,
          lineBindingsUnlinked,
        },
      }, transaction);
      return { lockId: lock.id, userId: target.user.id, authSubject: target.user.authSubject, providerState: UserTakeoverProviderState.PENDING, alreadyLocked: false };
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new ConflictError("The account changed");
    }
    throw new InfrastructureError("The account could not be locked");
  }

  if (locked.providerState === UserTakeoverProviderState.CONFIRMED || !locked.authSubject) {
    return { providerState: locked.providerState, alreadyLocked: locked.alreadyLocked };
  }

  // Provider I/O runs after commit, never inside a database lock.
  const outcome = await (dependencies.revokeProviderSessions ?? revokeProviderSessionsBySuspension)(locked.authSubject)
    .catch((): ProviderSessionRevocationOutcome => "AMBIGUOUS");
  const providerState = outcome === "CONFIRMED" ? UserTakeoverProviderState.CONFIRMED : UserTakeoverProviderState.RECONCILIATION_REQUIRED;
  try {
    await database.$transaction(async (transaction) => {
      const updated = await transaction.userTakeoverLock.updateMany({
        where: { id: locked.lockId, providerState: { not: UserTakeoverProviderState.CONFIRMED } },
        data: { providerState, providerCheckedAt: now() },
      });
      if (updated.count === 1) {
        await recordAuditEvent({
          actorUserId: actor.userId,
          action: "user.takeover_provider_sessions",
          resourceType: "User",
          resourceId: locked.userId,
          metadata: { hospitalId: targetHospitalId, outcome: providerState },
        }, transaction);
      }
    });
  } catch {
    // The account stays locked locally; the PENDING row is the quarantine marker and the action can be repeated.
    return { providerState: UserTakeoverProviderState.PENDING, alreadyLocked: locked.alreadyLocked };
  }
  return { providerState, alreadyLocked: locked.alreadyLocked };
}
