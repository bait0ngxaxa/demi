import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import { ForbiddenError } from "@/shared/errors/application-error";

import type {
  ActorContext,
  ActorHospitalMembership,
  ActorOsmHospitalRelationship,
} from "@/modules/auth/types/actor-context";

export const PATIENT_PROVISIONING_CAPABILITY = "patient:provision" as const;

export type PatientProvisioningCapability = typeof PATIENT_PROVISIONING_CAPABILITY;

export type PatientProvisioningPolicyDecision =
  | {
      allowed: true;
      reason: "active_direct_hospital_scope" | "active_osm_hospital_scope";
    }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "supported_role_required"
        | "active_direct_hospital_scope_required"
        | "active_osm_hospital_scope_required";
    };

function isActiveDirectHospitalScope(
  membership: Pick<ActorHospitalMembership, "membershipType" | "status" | "hospitalStatus">,
): boolean {
  const directMembership =
    membership.membershipType === MembershipType.OWNER ||
    membership.membershipType === MembershipType.MEMBER;

  return (
    directMembership &&
    membership.status === MembershipStatus.ACTIVE &&
    membership.hospitalStatus === HospitalStatus.ACTIVE
  );
}

function isActiveOsmHospitalScope(
  relationship: Pick<ActorOsmHospitalRelationship, "status" | "hospitalStatus">,
): boolean {
  return (
    relationship.status === MembershipStatus.ACTIVE &&
    relationship.hospitalStatus === HospitalStatus.ACTIVE
  );
}

export function hasDirectHospitalProvisioningScope(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
): boolean {
  return Boolean(
    actor?.roles.includes(Role.HOSPITAL) &&
      actor.hospitalMemberships.some(
        (membership) =>
          membership.hospitalId === targetHospitalId && isActiveDirectHospitalScope(membership),
      ),
  );
}

export function hasOsmHospitalProvisioningScope(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
): boolean {
  return Boolean(
    actor?.roles.includes(Role.OSM) &&
      actor.osmHospitalRelationships.some(
        (relationship) =>
          relationship.hospitalId === targetHospitalId && isActiveOsmHospitalScope(relationship),
      ),
  );
}

export function decidePatientProvisioningPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  targetHospitalId: unknown;
}): PatientProvisioningPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (input.capability !== PATIENT_PROVISIONING_CAPABILITY) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (typeof input.targetHospitalId !== "string" || !input.targetHospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  const targetHospitalId = input.targetHospitalId.trim();

  if (!input.actor.roles.includes(Role.HOSPITAL) && !input.actor.roles.includes(Role.OSM)) {
    return { allowed: false, reason: "supported_role_required" };
  }

  if (hasDirectHospitalProvisioningScope(input.actor, targetHospitalId)) {
    return { allowed: true, reason: "active_direct_hospital_scope" };
  }

  if (hasOsmHospitalProvisioningScope(input.actor, targetHospitalId)) {
    return { allowed: true, reason: "active_osm_hospital_scope" };
  }

  if (input.actor.roles.includes(Role.OSM)) {
    return { allowed: false, reason: "active_osm_hospital_scope_required" };
  }

  return { allowed: false, reason: "active_direct_hospital_scope_required" };
}

export function assertPatientProvisioningPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientProvisioningCapability;
  targetHospitalId: string;
}): void {
  const decision = decidePatientProvisioningPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export function assertPatientBulkProvisioningPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientProvisioningCapability;
  targetHospitalId: string;
}): void {
  assertPatientProvisioningPolicy(input);

  if (!hasDirectHospitalProvisioningScope(input.actor, input.targetHospitalId)) {
    throw new ForbiddenError();
  }
}

export const patientProvisioningPolicyInternals = {
  isActiveDirectHospitalScope,
  isActiveOsmHospitalScope,
};
