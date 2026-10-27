import "server-only";

import {
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

import { assertWorkforceRelationshipsCompatible } from "@/modules/identity/services/workforce-relationship-compatibility";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ConflictError } from "@/shared/errors/application-error";

/** `WorkforceActivation.relationshipKind` of a Child OWNER invitation (SQL CHECK, migration 20261101110000). */
export const CHILD_OWNER_RELATIONSHIP_KIND = "CHILD_OWNER";

const CHILD_OWNER_INVITATION_UNAVAILABLE = "Child owner invitation is no longer available";

/** Active persisted OWNER of an ACTIVE Hospital with network role PARENT (same predicates as area management). */
export function parentOwnerMembershipWhere(userId: string, parentHospitalId: string): Prisma.HospitalMembershipWhereInput {
  return {
    hospitalId: parentHospitalId,
    userId,
    membershipType: MembershipType.OWNER,
    status: MembershipStatus.ACTIVE,
    user: { is: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } },
    hospital: { is: { status: HospitalStatus.ACTIVE, serviceAreaEligibility: { is: { kind: HospitalServiceAreaFacilityKind.PARENT } } } },
  };
}

export type ChildOwnerInvitationContext = {
  parentHospitalId: string;
  areaId: string;
  childStatus: HospitalStatus;
};

/**
 * ADR-0018 (O-D3/O-D4/O-D6): re-read inside the transaction that would make a pending Child OWNER membership ACTIVE
 * (token completion or acceptance). The Child still has role CHILD and is PENDING_VERIFICATION, or ACTIVE without an
 * ACTIVE OWNER (replacement); the area recorded at issuance is still active; the inviting Parent OWNER still holds
 * that authority. Every failure is the same conflict.
 */
export async function assertChildOwnerInvitationContext(
  transaction: Prisma.TransactionClient,
  input: { membershipId: string; childHospitalId: string; userId: string; expectedStatus: MembershipStatus },
): Promise<ChildOwnerInvitationContext> {
  await assertWorkforceRelationshipsCompatible(transaction, input.userId, "HOSPITAL");
  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      id: input.membershipId,
      hospitalId: input.childHospitalId,
      userId: input.userId,
      membershipType: MembershipType.OWNER,
      status: input.expectedStatus,
      invitedByUserId: { not: null },
      invitedViaServiceAreaId: { not: null },
    },
    select: {
      invitedByUserId: true,
      user: { select: { identityAssurance: true, takeoverLock: { select: { providerState: true } } } },
      invitedViaServiceArea: { select: { id: true, parentHospitalId: true, childHospitalId: true, endedAt: true } },
      hospital: { select: { status: true, serviceAreaEligibility: { select: { kind: true } } } },
    },
  });
  const area = membership?.invitedViaServiceArea;

  if (
    !membership?.invitedByUserId ||
    membership.user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION ||
    (membership.user.takeoverLock !== null && membership.user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED) ||
    !area ||
    area.childHospitalId !== input.childHospitalId ||
    area.endedAt !== null ||
    membership.hospital.serviceAreaEligibility?.kind !== HospitalServiceAreaFacilityKind.CHILD ||
    (membership.hospital.status !== HospitalStatus.PENDING_VERIFICATION && membership.hospital.status !== HospitalStatus.ACTIVE)
  ) {
    throw new ConflictError(CHILD_OWNER_INVITATION_UNAVAILABLE);
  }

  const [activeOwner, inviter] = await Promise.all([
    membership.hospital.status === HospitalStatus.ACTIVE
      ? transaction.hospitalMembership.findFirst({
          where: { hospitalId: input.childHospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
          select: { id: true },
        })
      : null,
    transaction.hospitalMembership.findFirst({
      where: parentOwnerMembershipWhere(membership.invitedByUserId, area.parentHospitalId),
      select: { id: true },
    }),
  ]);

  if (activeOwner || !inviter) {
    throw new ConflictError(CHILD_OWNER_INVITATION_UNAVAILABLE);
  }

  return { parentHospitalId: area.parentHospitalId, areaId: area.id, childStatus: membership.hospital.status };
}

/**
 * Makes the pending Child OWNER membership ACTIVE and, for a first OWNER, the Child ACTIVE (O-D2). Runs in the same
 * transaction as `assertChildOwnerInvitationContext`; guarded writes turn any concurrent change into a conflict.
 */
export async function activatePendingChildOwner(
  transaction: Prisma.TransactionClient,
  input: {
    membershipId: string;
    childHospitalId: string;
    userId: string;
    fromStatus: MembershipStatus;
    context: ChildOwnerInvitationContext;
    actorUserId: string | null;
  },
): Promise<void> {
  await assertWorkforceRelationshipsCompatible(transaction, input.userId, "HOSPITAL");
  const activatedOwner = await transaction.hospitalMembership.updateMany({
    where: {
      id: input.membershipId,
      userId: input.userId,
      hospitalId: input.childHospitalId,
      membershipType: MembershipType.OWNER,
      status: input.fromStatus,
    },
    data: { status: MembershipStatus.ACTIVE },
  });

  if (activatedOwner.count !== 1) {
    throw new ConflictError(CHILD_OWNER_INVITATION_UNAVAILABLE);
  }

  const firstOwner = input.context.childStatus === HospitalStatus.PENDING_VERIFICATION;

  if (firstOwner) {
    const activatedHospital = await transaction.hospital.updateMany({
      where: { id: input.childHospitalId, status: HospitalStatus.PENDING_VERIFICATION },
      data: { status: HospitalStatus.ACTIVE },
    });

    if (activatedHospital.count !== 1) {
      throw new ConflictError(CHILD_OWNER_INVITATION_UNAVAILABLE);
    }
  }

  await recordAuditEvent(
    {
      actorUserId: input.actorUserId,
      action: firstOwner ? "hospital.child_onboarded" : "hospital.child_owner_replaced",
      resourceType: "Hospital",
      resourceId: input.childHospitalId,
      metadata: {
        parentHospitalId: input.context.parentHospitalId,
        membershipId: input.membershipId,
        fromStatus: input.context.childStatus,
        toStatus: HospitalStatus.ACTIVE,
      },
    },
    transaction,
  );
}
