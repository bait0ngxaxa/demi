import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const HOSPITAL_CONTENT_CAPABILITIES = {
  read: "hospital-content:read",
  manage: "hospital-content:manage",
} as const;

export type HospitalContentCapability = (typeof HOSPITAL_CONTENT_CAPABILITIES)[keyof typeof HOSPITAL_CONTENT_CAPABILITIES];

export type HospitalContentPolicyDecision = {
  allowed: boolean;
  reason: "missing_actor" | "invalid_capability" | "invalid_scope" | "authenticated_identity_required" | "hospital_role_required" | "direct_active_owner_required" | "direct_hospital_owner_scope" | "patient_role_required" | "patient_self_relationship_scope";
  scope?: "DIRECT_HOSPITAL_OWNER" | "PATIENT_SELF_RELATIONSHIP";
};

export function decideHospitalContentPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  scope: unknown;
  hospitalId?: string;
}): HospitalContentPolicyDecision {
  if (!input.actor) return { allowed: false, reason: "missing_actor" };
  if (input.capability !== HOSPITAL_CONTENT_CAPABILITIES.read && input.capability !== HOSPITAL_CONTENT_CAPABILITIES.manage) {
    return { allowed: false, reason: "invalid_capability" };
  }
  if (input.scope !== "DIRECT_HOSPITAL_OWNER" && input.scope !== "PATIENT_SELF_RELATIONSHIP") return { allowed: false, reason: "invalid_scope" };
  if (!input.actor.userId.trim() || !input.actor.personId.trim()) {
    return { allowed: false, reason: "authenticated_identity_required" };
  }
  if (input.scope === "PATIENT_SELF_RELATIONSHIP") {
    if (input.capability !== HOSPITAL_CONTENT_CAPABILITIES.read) return { allowed: false, reason: "invalid_capability" };
    return input.actor.roles.includes(Role.PATIENT)
      ? { allowed: true, reason: "patient_self_relationship_scope", scope: "PATIENT_SELF_RELATIONSHIP" }
      : { allowed: false, reason: "patient_role_required" };
  }
  if (!input.actor.roles.includes(Role.HOSPITAL)) return { allowed: false, reason: "hospital_role_required" };

  const eligibleMembership = input.actor.hospitalMemberships.some((membership) =>
    (!input.hospitalId || membership.hospitalId === input.hospitalId) &&
    membership.membershipType === MembershipType.OWNER &&
    membership.status === MembershipStatus.ACTIVE &&
    membership.hospitalStatus === HospitalStatus.ACTIVE,
  );

  return eligibleMembership
    ? { allowed: true, reason: "direct_hospital_owner_scope", scope: "DIRECT_HOSPITAL_OWNER" }
    : { allowed: false, reason: "direct_active_owner_required" };
}

export function assertHospitalContentPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: HospitalContentCapability;
  scope: "DIRECT_HOSPITAL_OWNER" | "PATIENT_SELF_RELATIONSHIP";
  hospitalId?: string;
}): asserts input is { actor: ActorContext; capability: HospitalContentCapability; scope: "DIRECT_HOSPITAL_OWNER" | "PATIENT_SELF_RELATIONSHIP" } {
  if (!decideHospitalContentPolicy(input).allowed) throw new ForbiddenError();
}
