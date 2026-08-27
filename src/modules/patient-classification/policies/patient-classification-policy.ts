import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PATIENT_CLASSIFICATION_READ_CAPABILITY = "patient:classification:read" as const;
export const PATIENT_CLASSIFICATION_MANAGE_CAPABILITY = "patient:classification:manage" as const;

export type PatientClassificationCapability =
  | typeof PATIENT_CLASSIFICATION_READ_CAPABILITY
  | typeof PATIENT_CLASSIFICATION_MANAGE_CAPABILITY;

export type PatientClassificationPolicyTarget = {
  hospitalId: string;
  hospitalStatus: HospitalStatus;
  assignedOsmUserId: string | null;
  patientRelationshipExists: boolean;
};

export type PatientClassificationPolicyDecision =
  | {
      allowed: true;
      reason: "active_direct_hospital_scope" | "active_osm_read_scope";
    }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "inactive_target_hospital"
        | "patient_relationship_required"
        | "classification_role_required"
        | "active_direct_hospital_scope_required"
        | "active_osm_read_scope_required"
        | "manage_requires_direct_hospital_scope";
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

function hasExactActiveOsmReadScope(
  actor: ActorContext,
  target: PatientClassificationPolicyTarget,
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

export function decidePatientClassificationPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: PatientClassificationPolicyTarget;
}): PatientClassificationPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    input.capability !== PATIENT_CLASSIFICATION_READ_CAPABILITY &&
    input.capability !== PATIENT_CLASSIFICATION_MANAGE_CAPABILITY
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (!input.target || typeof input.target.hospitalId !== "string" || !input.target.hospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  if (input.target.hospitalStatus !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "inactive_target_hospital" };
  }

  if (!input.target.patientRelationshipExists) {
    return { allowed: false, reason: "patient_relationship_required" };
  }

  const hasDirectScope =
    input.actor.roles.includes(Role.HOSPITAL) &&
    hasActiveDirectHospitalScope(input.actor, input.target.hospitalId);

  if (hasDirectScope) {
    return { allowed: true, reason: "active_direct_hospital_scope" };
  }

  if (
    input.capability === PATIENT_CLASSIFICATION_READ_CAPABILITY &&
    input.actor.roles.includes(Role.OSM) &&
    hasExactActiveOsmReadScope(input.actor, input.target)
  ) {
    return { allowed: true, reason: "active_osm_read_scope" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL) && !input.actor.roles.includes(Role.OSM)) {
    return { allowed: false, reason: "classification_role_required" };
  }

  if (input.capability === PATIENT_CLASSIFICATION_MANAGE_CAPABILITY) {
    return { allowed: false, reason: "manage_requires_direct_hospital_scope" };
  }

  if (input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "active_direct_hospital_scope_required" };
  }

  return { allowed: false, reason: "active_osm_read_scope_required" };
}

export function assertPatientClassificationPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientClassificationCapability;
  target: PatientClassificationPolicyTarget;
}): void {
  const decision = decidePatientClassificationPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const patientClassificationPolicyInternals = {
  hasActiveDirectHospitalScope,
  hasExactActiveOsmReadScope,
};
