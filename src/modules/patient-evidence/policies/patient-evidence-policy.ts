import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PATIENT_ARTIFACT_READ_CAPABILITY = "patient-artifact:read" as const;
export const PATIENT_ARTIFACT_CREATE_CAPABILITY = "patient-artifact:create" as const;

export type PatientEvidenceCapability =
  | typeof PATIENT_ARTIFACT_READ_CAPABILITY
  | typeof PATIENT_ARTIFACT_CREATE_CAPABILITY;

export type PatientEvidencePolicyTarget = {
  hospitalId: string;
  hospitalStatus: HospitalStatus;
  assignedOsmUserId: string | null;
};

export type PatientEvidencePolicyDecision =
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
        | "artifact_role_required"
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
  target: PatientEvidencePolicyTarget,
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

export function decidePatientEvidencePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: PatientEvidencePolicyTarget;
}): PatientEvidencePolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    input.capability !== PATIENT_ARTIFACT_READ_CAPABILITY &&
    input.capability !== PATIENT_ARTIFACT_CREATE_CAPABILITY
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
    return { allowed: false, reason: "artifact_role_required" };
  }

  if (input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "active_direct_hospital_scope_required" };
  }

  return { allowed: false, reason: "active_osm_assignment_scope_required" };
}

export function assertPatientEvidencePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientEvidenceCapability;
  target: PatientEvidencePolicyTarget;
}): void {
  const decision = decidePatientEvidencePolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const patientEvidencePolicyInternals = {
  hasActiveDirectHospitalScope,
  hasExactActiveOsmAssignment,
};
