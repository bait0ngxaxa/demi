import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import { PATIENT_READ_CAPABILITY } from "@/modules/patient-directory/policies/patient-directory-policy";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PATIENT_BASELINE_READ_CAPABILITY = PATIENT_READ_CAPABILITY;
export const PATIENT_BASELINE_CREATE_CAPABILITY = "patient:baseline:create" as const;

export type PatientBaselineCapability =
  | typeof PATIENT_BASELINE_READ_CAPABILITY
  | typeof PATIENT_BASELINE_CREATE_CAPABILITY;

export type PatientBaselinePolicyTarget = {
  hospitalId: string;
  hospitalStatus: HospitalStatus;
  assignedOsmUserId: string | null;
};

export type PatientBaselinePolicyDecision =
  | {
      allowed: true;
      reason: "active_direct_hospital_scope" | "active_osm_assignment_scope";
    }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "inactive_target_hospital"
        | "baseline_role_required"
        | "active_direct_hospital_scope_required"
        | "active_osm_assignment_scope_required";
    };

function hasActiveDirectHospitalScope(actor: ActorContext, hospitalId: string): boolean {
  return actor.hospitalMemberships.some(
    (membership) =>
      membership.hospitalId === hospitalId &&
      (membership.membershipType === MembershipType.OWNER ||
        membership.membershipType === MembershipType.MEMBER) &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospitalStatus === HospitalStatus.ACTIVE,
  );
}

function hasExactActiveOsmAssignment(
  actor: ActorContext,
  target: PatientBaselinePolicyTarget,
): boolean {
  return Boolean(
    target.assignedOsmUserId === actor.userId &&
      actor.osmHospitalRelationships.some(
        (relationship) =>
          relationship.hospitalId === target.hospitalId &&
          relationship.status === MembershipStatus.ACTIVE &&
          relationship.hospitalStatus === HospitalStatus.ACTIVE,
      ),
  );
}

export function decidePatientBaselinePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: PatientBaselinePolicyTarget;
}): PatientBaselinePolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    input.capability !== PATIENT_BASELINE_READ_CAPABILITY &&
    input.capability !== PATIENT_BASELINE_CREATE_CAPABILITY
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (!input.target || typeof input.target.hospitalId !== "string" || !input.target.hospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  if (input.target.hospitalStatus !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "inactive_target_hospital" };
  }

  if (
    input.actor.roles.includes(Role.HOSPITAL) &&
    hasActiveDirectHospitalScope(input.actor, input.target.hospitalId)
  ) {
    return { allowed: true, reason: "active_direct_hospital_scope" };
  }

  if (input.actor.roles.includes(Role.OSM) && hasExactActiveOsmAssignment(input.actor, input.target)) {
    return { allowed: true, reason: "active_osm_assignment_scope" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL) && !input.actor.roles.includes(Role.OSM)) {
    return { allowed: false, reason: "baseline_role_required" };
  }

  if (input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "active_direct_hospital_scope_required" };
  }

  return { allowed: false, reason: "active_osm_assignment_scope_required" };
}

export function assertPatientBaselinePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientBaselineCapability;
  target: PatientBaselinePolicyTarget;
}): void {
  const decision = decidePatientBaselinePolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const patientBaselinePolicyInternals = {
  hasActiveDirectHospitalScope,
  hasExactActiveOsmAssignment,
};
