import { Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { isActiveHospitalOperator } from "@/modules/identity/services/hospital-authority";

export const PATIENT_SERVICE_REQUEST_CAPABILITIES = {
  create: "patient-service-request:create",
  readSelf: "patient-service-request:read-self",
  withdrawSelf: "patient-service-request:withdraw-self",
  review: "patient-service-request:review",
} as const;

export type PatientServiceRequestCapability =
  (typeof PATIENT_SERVICE_REQUEST_CAPABILITIES)[keyof typeof PATIENT_SERVICE_REQUEST_CAPABILITIES];

export type PatientServiceRequestPolicyInput = {
  actor: ActorContext | null | undefined;
  capability: unknown;
  hospitalId?: unknown;
};

export type PatientServiceRequestPolicyDecision =
  | { allowed: true; reason: "patient_self" | "hospital_reviewer" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "role_required"
        | "exact_hospital_scope_required";
    };

const capabilities = new Set<PatientServiceRequestCapability>(
  Object.values(PATIENT_SERVICE_REQUEST_CAPABILITIES),
);

export function decidePatientServiceRequestPolicy(
  input: PatientServiceRequestPolicyInput,
): PatientServiceRequestPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (typeof input.capability !== "string" || !capabilities.has(input.capability as PatientServiceRequestCapability)) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (
    input.capability === PATIENT_SERVICE_REQUEST_CAPABILITIES.create ||
    input.capability === PATIENT_SERVICE_REQUEST_CAPABILITIES.readSelf ||
    input.capability === PATIENT_SERVICE_REQUEST_CAPABILITIES.withdrawSelf
  ) {
    return input.actor.roles.includes(Role.PATIENT)
      ? { allowed: true, reason: "patient_self" }
      : { allowed: false, reason: "role_required" };
  }

  if (typeof input.hospitalId !== "string" || !input.hospitalId.trim()) {
    return { allowed: false, reason: "exact_hospital_scope_required" };
  }

  const targetHospitalId = input.hospitalId.trim();
  const hasHospitalRole = input.actor.roles.includes(Role.HOSPITAL);
  const hasPlatformAdminRole = input.actor.roles.includes(Role.ADMIN);

  // ADR-0026: an ACTIVE OWNER or MEMBER confirms ("ยืนยันนัด") and rejects requests of the Hospital.

  if (
    input.capability === PATIENT_SERVICE_REQUEST_CAPABILITIES.review &&
    hasHospitalRole &&
    !hasPlatformAdminRole &&
    isActiveHospitalOperator(input.actor, targetHospitalId)
  ) {
    return { allowed: true, reason: "hospital_reviewer" };
  }

  if (!hasHospitalRole || hasPlatformAdminRole) {
    return { allowed: false, reason: "role_required" };
  }

  return { allowed: false, reason: "exact_hospital_scope_required" };
}

