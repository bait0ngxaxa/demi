import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import { ForbiddenError } from "@/shared/errors/application-error";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const WORKFORCE_CAPABILITIES = {
  read: "membership:read",
  create: "membership:create",
  update: "membership:update",
  suspend: "membership:suspend",
  restore: "membership:restore",
  osmProvision: "osm:provision",
  osmSuspend: "osm:suspend",
  osmRestore: "osm:restore",
} as const;

export type WorkforceCapability =
  (typeof WORKFORCE_CAPABILITIES)[keyof typeof WORKFORCE_CAPABILITIES];

export type WorkforcePolicyDecision =
  | { allowed: true; reason: "active_hospital_owner" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "hospital_role_required"
        | "active_owner_membership_required"
        | "active_hospital_required"
        | "invalid_target_hospital";
    };

const capabilityValues = new Set<WorkforceCapability>(Object.values(WORKFORCE_CAPABILITIES));

export function decideWorkforcePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  targetHospitalId: unknown;
}): WorkforcePolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    typeof input.capability !== "string" ||
    !capabilityValues.has(input.capability as WorkforceCapability)
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

export function assertWorkforcePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: WorkforceCapability;
  targetHospitalId: string;
}): void {
  const decision = decideWorkforcePolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const workforcePolicyInternals = { capabilityValues };
