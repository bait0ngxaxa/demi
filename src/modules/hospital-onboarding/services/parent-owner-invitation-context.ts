import "server-only";

import {
  HospitalOnboardingApplicationStatus,
  HospitalServiceAreaFacilityKind,
  HospitalStatus,
  IdentityAssurance,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  UserTakeoverProviderState,
  type Prisma,
} from "@prisma/client";

import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { assertWorkforceRelationshipsCompatible } from "@/modules/identity/services/workforce-relationship-compatibility";
import { ConflictError } from "@/shared/errors/application-error";

/** `WorkforceActivation.relationshipKind` of a Parent OWNER invitation (SQL CHECK, migration 20261201110000). */
export const PARENT_OWNER_RELATIONSHIP_KIND = "PARENT_OWNER";

const PARENT_OWNER_INVITATION_UNAVAILABLE = "Parent owner invitation is no longer available";

/**
 * ADR-0024: a Hospital platform ADMIN may invite an OWNER for. Network role PARENT and never the Child of any area
 * (the same rule as `onboardableHospitalWhere`), waiting for its first OWNER or ACTIVE (replacement, checked apart).
 */
export const parentOwnerInvitableHospitalWhere = {
  status: { in: [HospitalStatus.PENDING_VERIFICATION, HospitalStatus.ACTIVE] },
  serviceAreaEligibility: { is: { kind: HospitalServiceAreaFacilityKind.PARENT } },
  serviceAreaAssignments: { none: {} },
} satisfies Prisma.HospitalWhereInput;

/** An OWNER invitation still open on any path (Child or Parent); at most one per Hospital (partial unique index). */
export const openOwnerInvitationWhere = {
  membershipType: MembershipType.OWNER,
  status: { in: [MembershipStatus.PROVISIONED, MembershipStatus.INVITED] },
} satisfies Prisma.HospitalMembershipWhereInput;

/** Persisted ACTIVE platform ADMIN (the same predicate as `assertPlatformAdminInDatabase`). */
export function activePlatformAdminWhere(userId: string): Prisma.UserWhereInput {
  return { id: userId, status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } };
}

export type ParentOwnerInvitationContext = {
  hospitalStatus: HospitalStatus;
  invitedByUserId: string;
};

/**
 * ADR-0024: re-read inside the transaction that would make a pending Parent OWNER membership ACTIVE (token
 * completion or acceptance) and before a held invitation is released. The membership is the ADMIN invitation (inviter,
 * no area); the Hospital is still an invitable Parent, PENDING_VERIFICATION or ACTIVE without an ACTIVE OWNER, with no
 * PENDING public application; the inviter is still an ACTIVE platform ADMIN. Every failure is the same conflict.
 */
export async function assertParentOwnerInvitationContext(
  transaction: Prisma.TransactionClient,
  input: { membershipId: string; hospitalId: string; userId: string; expectedStatus: MembershipStatus },
): Promise<ParentOwnerInvitationContext> {
  await assertWorkforceRelationshipsCompatible(transaction, input.userId, "HOSPITAL");
  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      id: input.membershipId,
      hospitalId: input.hospitalId,
      userId: input.userId,
      membershipType: MembershipType.OWNER,
      status: input.expectedStatus,
      invitedByUserId: { not: null },
      invitedViaServiceAreaId: null,
      hospital: { is: parentOwnerInvitableHospitalWhere },
    },
    select: {
      invitedByUserId: true,
      user: { select: { identityAssurance: true, takeoverLock: { select: { providerState: true } } } },
      hospital: { select: { status: true } },
    },
  });

  if (
    !membership?.invitedByUserId ||
    membership.user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION ||
    (membership.user.takeoverLock !== null && membership.user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED)
  ) {
    throw new ConflictError(PARENT_OWNER_INVITATION_UNAVAILABLE);
  }

  const [activeOwner, pendingApplication, inviter] = await Promise.all([
    membership.hospital.status === HospitalStatus.ACTIVE
      ? transaction.hospitalMembership.findFirst({
          where: { hospitalId: input.hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
          select: { id: true },
        })
      : null,
    transaction.hospitalOnboardingApplication.findFirst({
      where: { hospitalId: input.hospitalId, status: HospitalOnboardingApplicationStatus.PENDING },
      select: { id: true },
    }),
    transaction.user.findFirst({ where: activePlatformAdminWhere(membership.invitedByUserId), select: { id: true } }),
  ]);

  if (activeOwner || pendingApplication || !inviter) {
    throw new ConflictError(PARENT_OWNER_INVITATION_UNAVAILABLE);
  }

  return { hospitalStatus: membership.hospital.status, invitedByUserId: membership.invitedByUserId };
}

/**
 * Makes the pending Parent OWNER membership ACTIVE and, for a first OWNER, the Hospital ACTIVE. Runs in the same
 * transaction as `assertParentOwnerInvitationContext`; guarded writes turn any concurrent change into a conflict.
 */
export async function activatePendingParentOwner(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    hospitalId: string;
    userId: string;
    fromStatus: MembershipStatus;
    context: ParentOwnerInvitationContext;
    actorUserId: string | null;
  },
): Promise<void> {
  await assertWorkforceRelationshipsCompatible(transaction, input.userId, "HOSPITAL");
  const activatedOwner = await transaction.hospitalMembership.updateMany({
    where: {
      id: input.membershipId,
      userId: input.userId,
      hospitalId: input.hospitalId,
      membershipType: MembershipType.OWNER,
      status: input.fromStatus,
      invitedViaServiceAreaId: null,
    },
    data: { status: MembershipStatus.ACTIVE },
  });

  if (activatedOwner.count !== 1) {
    throw new ConflictError(PARENT_OWNER_INVITATION_UNAVAILABLE);
  }

  const firstOwner = input.context.hospitalStatus === HospitalStatus.PENDING_VERIFICATION;

  if (firstOwner) {
    const activatedHospital = await transaction.hospital.updateMany({
      where: { id: input.hospitalId, status: HospitalStatus.PENDING_VERIFICATION },
      data: { status: HospitalStatus.ACTIVE },
    });

    if (activatedHospital.count !== 1) {
      throw new ConflictError(PARENT_OWNER_INVITATION_UNAVAILABLE);
    }
  }

  await recordAuditEvent(
    {
      actorUserId: input.actorUserId,
      action: firstOwner ? "hospital.parent_onboarded" : "hospital.parent_owner_replaced",
      resourceType: "Hospital",
      resourceId: input.hospitalId,
      metadata: {
        via: "ADMIN_INVITATION",
        invitedByUserId: input.context.invitedByUserId,
        membershipId: input.membershipId,
        fromStatus: input.context.hospitalStatus,
        toStatus: HospitalStatus.ACTIVE,
      },
    },
    transaction,
  );
}
