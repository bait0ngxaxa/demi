import "server-only";

import {
  IdentityAssurance,
  MembershipStatus,
  MembershipType,
  Prisma,
  UserStatus,
  UserTakeoverProviderState,
  type PrismaClient,
} from "@prisma/client";

import { revokeProviderSessionsBySuspension, type ProviderSessionRevocationOutcome } from "@/modules/account-security/adapters/supabase-account-security-provider";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { lockFirstCredentialOperation } from "@/modules/identity/services/first-credential-serialization";
import { unlinkLineBindingForSuspectedTakeover } from "@/modules/line/services/line-account-service";
import { credentialEstablishedAt, type UsedActivation } from "@/modules/user-management/domain/user-management-values";
import { InfrastructureError } from "@/shared/errors/application-error";

export type CaregiverInvitationTakeoverTask = {
  lockId: string;
  userId: string;
  authSubject: string;
  actorUserId: string;
  hospitalId: string;
  providerState: UserTakeoverProviderState;
};

export type CaregiverInvitationTakeoverDependencies = {
  revokeProviderSessions?: (authSubject: string) => Promise<ProviderSessionRevocationOutcome>;
};

/**
 * A caregiver claim is not independent identity proof. If Hospital provisioning is adding authority to that User,
 * commit the same global suspension and takeover evidence as REC-1 with the new role/relationship.
 */
export async function lockCaregiverInvitationIdentityInTransaction(
  transaction: Prisma.TransactionClient,
  input: { userId: string; actorUserId: string; hospitalId: string; now: Date },
): Promise<CaregiverInvitationTakeoverTask | null> {
  const user = await transaction.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      status: true,
      authSubject: true,
      identityAssurance: true,
      takeoverLock: { select: { id: true, providerState: true } },
      workforceActivations: { where: { usedAt: { not: null } }, select: { purpose: true, mode: true, usedAt: true } },
      patientActivations: { where: { usedAt: { not: null } }, select: { purpose: true, usedAt: true } },
    },
  });
  if (!user || user.identityAssurance !== IdentityAssurance.CAREGIVER_INVITATION) return null;

  if (user.takeoverLock && user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED) {
    if (user.status !== UserStatus.SUSPENDED || !user.authSubject) {
      throw new InfrastructureError("The caregiver account takeover lock is inconsistent");
    }
    if (user.takeoverLock.providerState === UserTakeoverProviderState.CONFIRMED) return null;
    return {
      lockId: user.takeoverLock.id,
      userId: user.id,
      authSubject: user.authSubject,
      actorUserId: input.actorUserId,
      hospitalId: input.hospitalId,
      providerState: user.takeoverLock.providerState,
    };
  }

  if (user.status !== UserStatus.ACTIVE || !user.authSubject) {
    throw new InfrastructureError("The caregiver account requires identity reconciliation");
  }

  await lockFirstCredentialOperation(transaction, user.id);
  const suspendedUser = await transaction.user.updateMany({
    where: { id: user.id, status: UserStatus.ACTIVE, identityAssurance: IdentityAssurance.CAREGIVER_INVITATION },
    data: { status: UserStatus.SUSPENDED },
  });
  if (suspendedUser.count !== 1) throw new InfrastructureError("The caregiver account changed during provisioning");

  const activeHere = { userId: user.id, hospitalId: input.hospitalId, status: MembershipStatus.ACTIVE };
  const [membershipRows, osmRows] = await Promise.all([
    transaction.hospitalMembership.findMany({
      where: { ...activeHere, membershipType: MembershipType.MEMBER },
      select: { id: true },
    }),
    transaction.osmHospitalRelationship.findMany({ where: activeHere, select: { id: true } }),
  ]);
  const [memberships, osmRelationships] = await Promise.all([
    transaction.hospitalMembership.updateMany({
      where: { id: { in: membershipRows.map(({ id }) => id) }, status: MembershipStatus.ACTIVE },
      data: { status: MembershipStatus.SUSPENDED },
    }),
    transaction.osmHospitalRelationship.updateMany({
      where: { id: { in: osmRows.map(({ id }) => id) }, status: MembershipStatus.ACTIVE },
      data: { status: MembershipStatus.SUSPENDED },
    }),
  ]);
  const unused = { userId: user.id, usedAt: null, revokedAt: null, claimedAt: null };
  const [workforceActivations, patientActivations] = await Promise.all([
    transaction.workforceActivation.updateMany({ where: unused, data: { revokedAt: input.now } }),
    transaction.patientActivation.updateMany({ where: unused, data: { revokedAt: input.now, claimExpiresAt: null } }),
  ]);
  const usedActivations: UsedActivation[] = [
    ...user.workforceActivations.flatMap((activation) => activation.usedAt
      ? [{ source: "WORKFORCE" as const, ...activation, usedAt: activation.usedAt }]
      : []),
    ...user.patientActivations.flatMap((activation) => activation.usedAt
      ? [{ source: "PATIENT" as const, ...activation, usedAt: activation.usedAt }]
      : []),
  ];
  const lineBindingsUnlinked = await unlinkLineBindingForSuspectedTakeover(transaction, {
    userId: user.id,
    actorUserId: input.actorUserId,
    hospitalId: input.hospitalId,
    credentialEstablishedAt: credentialEstablishedAt(usedActivations),
    now: input.now,
  });

  const lock = user.takeoverLock
    ? await transaction.userTakeoverLock.update({
        where: { id: user.takeoverLock.id },
        data: {
          hospitalId: input.hospitalId,
          lockedByUserId: input.actorUserId,
          lockedAt: input.now,
          providerState: UserTakeoverProviderState.PENDING,
          providerCheckedAt: null,
          suspendedMembershipIds: membershipRows.map(({ id }) => id),
          suspendedOsmRelationshipIds: osmRows.map(({ id }) => id),
        },
        select: { id: true },
      })
    : await transaction.userTakeoverLock.create({
        data: {
          userId: user.id,
          hospitalId: input.hospitalId,
          lockedByUserId: input.actorUserId,
          lockedAt: input.now,
          suspendedMembershipIds: membershipRows.map(({ id }) => id),
          suspendedOsmRelationshipIds: osmRows.map(({ id }) => id),
        },
        select: { id: true },
      });

  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "user.takeover_locked",
    resourceType: "User",
    resourceId: user.id,
    metadata: {
      hospitalId: input.hospitalId,
      reason: "CAREGIVER_INVITATION_IDENTITY_PROVISIONED",
      relationshipsSuspended: memberships.count + osmRelationships.count,
      activationsRevoked: workforceActivations.count + patientActivations.count,
      lineBindingsUnlinked,
    },
  }, transaction);

  return {
    lockId: lock.id,
    userId: user.id,
    authSubject: user.authSubject,
    actorUserId: input.actorUserId,
    hospitalId: input.hospitalId,
    providerState: UserTakeoverProviderState.PENDING,
  };
}

/** Runs only after the provisioning transaction committed. Ambiguity keeps the User suspended and quarantined. */
export async function revokeCaregiverInvitationTakeoverSessionsAfterCommit(
  database: PrismaClient,
  task: CaregiverInvitationTakeoverTask,
  dependencies: CaregiverInvitationTakeoverDependencies = {},
): Promise<UserTakeoverProviderState> {
  if (task.providerState === UserTakeoverProviderState.CONFIRMED) return task.providerState;
  const outcome = await (dependencies.revokeProviderSessions ?? revokeProviderSessionsBySuspension)(task.authSubject)
    .catch((): ProviderSessionRevocationOutcome => "AMBIGUOUS");
  const providerState = outcome === "CONFIRMED"
    ? UserTakeoverProviderState.CONFIRMED
    : UserTakeoverProviderState.RECONCILIATION_REQUIRED;

  try {
    await database.$transaction(async (transaction) => {
      const updated = await transaction.userTakeoverLock.updateMany({
        where: {
          id: task.lockId,
          providerState: { in: [UserTakeoverProviderState.PENDING, UserTakeoverProviderState.RECONCILIATION_REQUIRED] },
        },
        data: { providerState, providerCheckedAt: new Date() },
      });
      if (updated.count === 1) {
        await recordAuditEvent({
          actorUserId: task.actorUserId,
          action: "user.takeover_provider_sessions",
          resourceType: "User",
          resourceId: task.userId,
          metadata: { hospitalId: task.hospitalId, outcome: providerState },
        }, transaction);
      }
    });
    return providerState;
  } catch {
    // The committed local SUSPENDED state and PENDING lock remain the authoritative quarantine.
    return UserTakeoverProviderState.PENDING;
  }
}
