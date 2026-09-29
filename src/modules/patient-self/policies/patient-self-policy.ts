import "server-only";

import { Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { APPOINTMENT_READ_CAPABILITY } from "@/modules/appointments/policies/appointment-policy";
import { FOLLOWUP_READ_CAPABILITY } from "@/modules/followups/policies/followup-policy";
import { GOAL_READ_CAPABILITY } from "@/modules/goals/policies/goal-policy";
import {
  PATIENT_READ_CAPABILITY,
  type PatientReadCapability,
} from "@/modules/patient-directory/policies/patient-directory-policy";
import { PATIENT_PROGRAM_READ_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import { SCREENING_READ_CAPABILITY } from "@/modules/screening/policies/screening-policy";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PATIENT_SELF_READ_CAPABILITIES = [
  PATIENT_READ_CAPABILITY,
  SCREENING_READ_CAPABILITY,
  PATIENT_PROGRAM_READ_CAPABILITY,
  GOAL_READ_CAPABILITY,
  FOLLOWUP_READ_CAPABILITY,
  APPOINTMENT_READ_CAPABILITY,
] as const;

export type PatientSelfReadCapability = (typeof PATIENT_SELF_READ_CAPABILITIES)[number];

export type PatientSelfReadPolicyDecision = {
  allowed: boolean;
  reason:
    | "missing_actor"
    | "invalid_capability"
    | "patient_role_required"
    | "authenticated_identity_required"
    | "patient_self_scope";
  scope?: "SELF";
};

export function decidePatientSelfReadPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
}): PatientSelfReadPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    typeof input.capability !== "string" ||
    !PATIENT_SELF_READ_CAPABILITIES.some((capability) => capability === input.capability)
  ) {
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

export function assertPatientSelfReadPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientSelfReadCapability | PatientReadCapability;
}): asserts input is { actor: ActorContext; capability: PatientSelfReadCapability } {
  const decision = decidePatientSelfReadPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}
