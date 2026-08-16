import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PATIENT_ASSIGN_OSM_CAPABILITY = "patient:assign-osm" as const;

export type PatientAssignOsmCapability = typeof PATIENT_ASSIGN_OSM_CAPABILITY;

export type PatientOsmAssignmentPolicyDecision =
  | {
      allowed: true;
      reason: "active_hospital_owner";
    }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "hospital_role_required"
        | "active_owner_membership_required"
        | "active_hospital_required";
    };

export function decidePatientOsmAssignmentPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  targetHospitalId: unknown;
}): PatientOsmAssignmentPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (input.capability !== PATIENT_ASSIGN_OSM_CAPABILITY) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (typeof input.targetHospitalId !== "string" || !input.targetHospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  const membership = input.actor.hospitalMemberships.find(
    (candidate) =>
      candidate.hospitalId === input.targetHospitalId &&
      candidate.membershipType === MembershipType.OWNER &&
      candidate.status === MembershipStatus.ACTIVE,
  );

  if (!membership) {
    return { allowed: false, reason: "active_owner_membership_required" };
  }

  if (membership.hospitalStatus !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "active_hospital_required" };
  }

  return { allowed: true, reason: "active_hospital_owner" };
}

export function assertPatientOsmAssignmentPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientAssignOsmCapability;
  targetHospitalId: string;
}): void {
  const decision = decidePatientOsmAssignmentPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}
