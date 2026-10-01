import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY =
  "patient-access-request:review" as const;

export type PatientAccessRequestPolicyDecision =
  | { allowed: true; reason: "exact_hospital_reviewer" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "hospital_role_required"
        | "active_direct_membership_required";
    };

export function decidePatientAccessRequestPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  hospitalId: unknown;
}): PatientAccessRequestPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (input.capability !== PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL) || input.actor.roles.includes(Role.ADMIN)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  if (typeof input.hospitalId !== "string" || !input.hospitalId.trim()) {
    return { allowed: false, reason: "active_direct_membership_required" };
  }

  const hospitalId = input.hospitalId.trim();
  const hasDirectReviewMembership = input.actor.hospitalMemberships.some(
    (membership) =>
      membership.hospitalId === hospitalId &&
      (membership.membershipType === MembershipType.OWNER ||
        membership.membershipType === MembershipType.MEMBER) &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospitalStatus === HospitalStatus.ACTIVE,
  );

  return hasDirectReviewMembership
    ? { allowed: true, reason: "exact_hospital_reviewer" }
    : { allowed: false, reason: "active_direct_membership_required" };
}
