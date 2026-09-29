import "server-only";

import { Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  PATIENT_READ_CAPABILITY,
  type PatientReadCapability,
} from "@/modules/patient-directory/policies/patient-directory-policy";
import { ForbiddenError } from "@/shared/errors/application-error";

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

  if (input.capability !== PATIENT_READ_CAPABILITY) {
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
  capability: PatientReadCapability;
}): asserts input is { actor: ActorContext; capability: PatientReadCapability } {
  const decision = decidePatientSelfReadPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}
