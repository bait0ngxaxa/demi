import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export type AccountRecoveryIssuePolicyDecision = {
  allowed: boolean;
  reason:
    | "missing_actor"
    | "hospital_role_required"
    | "owner_membership_required"
    | "active_scope_required"
    | "active_owner_scope";
};

export function decideAccountRecoveryIssuePolicy(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
): AccountRecoveryIssuePolicyDecision {
  if (!actor || !actor.userId.trim()) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (!actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  const membership = actor.hospitalMemberships.find(
    (candidate) => candidate.hospitalId === targetHospitalId,
  );

  if (!membership || membership.membershipType !== MembershipType.OWNER) {
    return { allowed: false, reason: "owner_membership_required" };
  }

  if (
    membership.status !== MembershipStatus.ACTIVE ||
    membership.hospitalStatus !== HospitalStatus.ACTIVE
  ) {
    return { allowed: false, reason: "active_scope_required" };
  }

  return { allowed: true, reason: "active_owner_scope" };
}
