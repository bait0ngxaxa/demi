import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const PATIENT_SERVICE_REQUEST_CAPABILITIES = {
  manageCatalog: "patient-service-catalog:manage",
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
  | { allowed: true; reason: "patient_self" | "hospital_owner" | "hospital_reviewer" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "role_required"
        | "exact_hospital_scope_required"
        | "active_owner_scope_required";
    };

const capabilities = new Set<PatientServiceRequestCapability>(
  Object.values(PATIENT_SERVICE_REQUEST_CAPABILITIES),
);

function isActiveHospitalMembership(
  actor: ActorContext,
  hospitalId: string,
  membershipTypes: readonly MembershipType[],
): boolean {
  return actor.hospitalMemberships.some(
    (membership) =>
      membership.hospitalId === hospitalId &&
      membershipTypes.includes(membership.membershipType) &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospitalStatus === HospitalStatus.ACTIVE,
  );
}

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

  if (
    input.capability === PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog &&
    hasHospitalRole &&
    !hasPlatformAdminRole &&
    isActiveHospitalMembership(input.actor, targetHospitalId, [MembershipType.OWNER])
  ) {
    return { allowed: true, reason: "hospital_owner" };
  }

  if (
    input.capability === PATIENT_SERVICE_REQUEST_CAPABILITIES.review &&
    hasHospitalRole &&
    !hasPlatformAdminRole &&
    isActiveHospitalMembership(input.actor, targetHospitalId, [
      MembershipType.OWNER,
      MembershipType.MEMBER,
    ])
  ) {
    return { allowed: true, reason: "hospital_reviewer" };
  }

  if (!hasHospitalRole || hasPlatformAdminRole) {
    return { allowed: false, reason: "role_required" };
  }

  return {
    allowed: false,
    reason:
      input.capability === PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog
        ? "active_owner_scope_required"
        : "exact_hospital_scope_required",
  };
}

export const patientServiceRequestPolicyInternals = { isActiveHospitalMembership };
