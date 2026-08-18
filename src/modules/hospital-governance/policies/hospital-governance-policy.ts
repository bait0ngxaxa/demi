import "server-only";

import { Role } from "@prisma/client";

import { ForbiddenError } from "@/shared/errors/application-error";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const HOSPITAL_GOVERNANCE_CAPABILITIES = {
  readGovernance: "hospital:read-governance",
  suspend: "hospital:suspend",
  restore: "hospital:restore",
} as const;

export type HospitalGovernanceCapability =
  (typeof HOSPITAL_GOVERNANCE_CAPABILITIES)[keyof typeof HOSPITAL_GOVERNANCE_CAPABILITIES];

export type HospitalGovernancePolicyDecision =
  | { allowed: true; reason: "active_platform_admin" }
  | {
      allowed: false;
      reason: "missing_actor" | "platform_admin_required" | "invalid_capability";
    };

const capabilityValues = new Set<HospitalGovernanceCapability>(
  Object.values(HOSPITAL_GOVERNANCE_CAPABILITIES),
);

export function decideHospitalGovernancePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
}): HospitalGovernancePolicyDecision {
  if (
    typeof input.capability !== "string" ||
    !capabilityValues.has(input.capability as HospitalGovernanceCapability)
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (!input.actor.roles.includes(Role.ADMIN)) {
    return { allowed: false, reason: "platform_admin_required" };
  }

  return { allowed: true, reason: "active_platform_admin" };
}

export function assertHospitalGovernanceCapability(
  actor: ActorContext | null | undefined,
  capability: HospitalGovernanceCapability,
): void {
  const decision = decideHospitalGovernancePolicy({ actor, capability });

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const hospitalGovernancePolicyInternals = { capabilityValues };
