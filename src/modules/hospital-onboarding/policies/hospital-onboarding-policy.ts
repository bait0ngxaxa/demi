import "server-only";

import { Role } from "@prisma/client";

import { ForbiddenError } from "@/shared/errors/application-error";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const HOSPITAL_ONBOARDING_CAPABILITIES = {
  onboard: "hospital:onboard",
  review: "hospital:review",
  approve: "hospital:approve",
  reject: "hospital:reject",
} as const;

export type HospitalOnboardingCapability =
  (typeof HOSPITAL_ONBOARDING_CAPABILITIES)[keyof typeof HOSPITAL_ONBOARDING_CAPABILITIES];

export type HospitalOnboardingPolicyDecision =
  | { allowed: true; reason: "public_admission" | "platform_admin" }
  | {
      allowed: false;
      reason: "missing_actor" | "platform_admin_required" | "invalid_capability";
    };

const capabilityValues = new Set<HospitalOnboardingCapability>(
  Object.values(HOSPITAL_ONBOARDING_CAPABILITIES),
);

export function decideHospitalOnboardingPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
}): HospitalOnboardingPolicyDecision {
  if (typeof input.capability !== "string" || !capabilityValues.has(input.capability as HospitalOnboardingCapability)) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (input.capability === HOSPITAL_ONBOARDING_CAPABILITIES.onboard) {
    return { allowed: true, reason: "public_admission" };
  }

  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (!input.actor.roles.includes(Role.ADMIN)) {
    return { allowed: false, reason: "platform_admin_required" };
  }

  return { allowed: true, reason: "platform_admin" };
}

export function assertHospitalOnboardingCapability(
  actor: ActorContext | null | undefined,
  capability: HospitalOnboardingCapability,
): void {
  const decision = decideHospitalOnboardingPolicy({ actor, capability });

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}
