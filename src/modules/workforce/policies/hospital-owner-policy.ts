import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import { ForbiddenError } from "@/shared/errors/application-error";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const HOSPITAL_OWNER_CAPABILITIES = {
  readGovernance: "hospital-owner:read-governance",
  promote: "hospital-owner:promote",
  demote: "hospital-owner:demote",
} as const;

export type HospitalOwnerCapability =
  (typeof HOSPITAL_OWNER_CAPABILITIES)[keyof typeof HOSPITAL_OWNER_CAPABILITIES];

export type HospitalOwnerPolicyDecision =
  | { allowed: true; reason: "active_hospital_owner" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "hospital_role_required"
        | "active_owner_membership_required"
        | "active_hospital_required";
    };

const capabilityValues = new Set<HospitalOwnerCapability>(
  Object.values(HOSPITAL_OWNER_CAPABILITIES),
);

export function decideHospitalOwnerPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  targetHospitalId: unknown;
}): HospitalOwnerPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    typeof input.capability !== "string" ||
    !capabilityValues.has(input.capability as HospitalOwnerCapability)
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (typeof input.targetHospitalId !== "string" || !input.targetHospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  const membership = input.actor.hospitalMemberships.find(
    (candidate) =>
      candidate.hospitalId === input.targetHospitalId &&
      candidate.membershipType === MembershipType.OWNER &&
      candidate.status === MembershipStatus.ACTIVE,
  );

  if (!membership) {
    return { allowed: false, reason: "active_owner_membership_required" };
  }

  if (membership.hospitalStatus !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "active_hospital_required" };
  }

  return { allowed: true, reason: "active_hospital_owner" };
}

export function assertHospitalOwnerPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: HospitalOwnerCapability;
  targetHospitalId: string;
}): void {
  const decision = decideHospitalOwnerPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const hospitalOwnerPolicyInternals = { capabilityValues };
