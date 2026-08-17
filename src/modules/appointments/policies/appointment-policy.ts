import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const APPOINTMENT_READ_CAPABILITY = "appointment:read" as const;
export const APPOINTMENT_MANAGE_CAPABILITY = "appointment:manage" as const;

export type AppointmentCapability =
  | typeof APPOINTMENT_READ_CAPABILITY
  | typeof APPOINTMENT_MANAGE_CAPABILITY;

export type AppointmentPolicyTarget = {
  hospitalId: string;
  hospitalStatus: HospitalStatus;
  assignedOsmUserId: string | null;
};

export type AppointmentPolicyDecision =
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
        | "appointment_role_required"
        | "active_direct_hospital_scope_required"
        | "active_osm_assignment_scope_required"
        | "osm_manage_not_allowed";
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

function hasExactActiveOsmAssignment(actor: ActorContext, target: AppointmentPolicyTarget): boolean {
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

export function decideAppointmentPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: AppointmentPolicyTarget;
}): AppointmentPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    input.capability !== APPOINTMENT_READ_CAPABILITY &&
    input.capability !== APPOINTMENT_MANAGE_CAPABILITY
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

  if (input.actor.roles.includes(Role.OSM)) {
    if (!hasExactActiveOsmAssignment(input.actor, input.target)) {
      return { allowed: false, reason: "active_osm_assignment_scope_required" };
    }

    if (input.capability === APPOINTMENT_MANAGE_CAPABILITY) {
      return { allowed: false, reason: "osm_manage_not_allowed" };
    }

    return { allowed: true, reason: "active_osm_assignment_scope" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "appointment_role_required" };
  }

  return { allowed: false, reason: "active_direct_hospital_scope_required" };
}

export function assertAppointmentPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: AppointmentCapability;
  target: AppointmentPolicyTarget;
}): void {
  const decision = decideAppointmentPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const appointmentPolicyInternals = {
  hasActiveDirectHospitalScope,
  hasExactActiveOsmAssignment,
};
