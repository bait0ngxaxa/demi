import { Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY = "patient:profile:update" as const;

export type PatientHospitalProfileUpdatePolicyDecision = {
  allowed: boolean;
  reason:
    | "missing_actor"
    | "invalid_capability"
    | "patient_role_required"
    | "authenticated_identity_required"
    | "patient_self_scope";
  scope?: "SELF";
};

export function decidePatientHospitalProfileUpdatePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
}): PatientHospitalProfileUpdatePolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (input.capability !== PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (!input.actor.roles.includes(Role.PATIENT)) {
    return { allowed: false, reason: "patient_role_required" };
  }

  if (!input.actor.userId.trim() || !input.actor.personId.trim()) {
    return { allowed: false, reason: "authenticated_identity_required" };
  }

  return { allowed: true, reason: "patient_self_scope", scope: "SELF" };
}

export function assertPatientHospitalProfileUpdatePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: typeof PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY;
}): asserts input is { actor: ActorContext; capability: typeof PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY } {
  if (!decidePatientHospitalProfileUpdatePolicy(input).allowed) {
    throw new ForbiddenError();
  }
}
