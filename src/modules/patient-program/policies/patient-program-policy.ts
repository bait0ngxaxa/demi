import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PATIENT_PROGRAM_READ_CAPABILITY = "program:read" as const;
export const PATIENT_PROGRAM_MANAGE_CAPABILITY = "program:manage" as const;

export type PatientProgramCapability =
  | typeof PATIENT_PROGRAM_READ_CAPABILITY
  | typeof PATIENT_PROGRAM_MANAGE_CAPABILITY;

export type PatientProgramPolicyTarget = {
  hospitalId: string;
  hospitalStatus: HospitalStatus;
  assignedOsmUserId: string | null;
};

export type PatientProgramPolicyDecision =
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
        | "program_role_required"
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
  target: PatientProgramPolicyTarget,
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

export function decidePatientProgramPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: PatientProgramPolicyTarget;
}): PatientProgramPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    input.capability !== PATIENT_PROGRAM_READ_CAPABILITY &&
    input.capability !== PATIENT_PROGRAM_MANAGE_CAPABILITY
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

  if (
    input.actor.roles.includes(Role.OSM) &&
    hasExactActiveOsmAssignment(input.actor, input.target)
  ) {
    return { allowed: true, reason: "active_osm_assignment_scope" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL) && !input.actor.roles.includes(Role.OSM)) {
    return { allowed: false, reason: "program_role_required" };
  }

  if (input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "active_direct_hospital_scope_required" };
  }

  return { allowed: false, reason: "active_osm_assignment_scope_required" };
}

export function assertPatientProgramPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientProgramCapability;
  target: PatientProgramPolicyTarget;
}): void {
  const decision = decidePatientProgramPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const patientProgramPolicyInternals = {
  hasActiveDirectHospitalScope,
  hasExactActiveOsmAssignment,
};
