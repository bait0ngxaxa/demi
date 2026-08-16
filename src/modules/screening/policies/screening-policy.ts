import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const SCREENING_READ_CAPABILITY = "screening:read" as const;
export const SCREENING_SUBMIT_CAPABILITY = "screening:submit" as const;

export type ScreeningCapability =
  | typeof SCREENING_READ_CAPABILITY
  | typeof SCREENING_SUBMIT_CAPABILITY;

export type ScreeningPolicyDecision =
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
        | "screening_role_required"
        | "active_direct_hospital_scope_required"
        | "active_osm_assignment_scope_required";
    };

export type ScreeningPolicyTarget = {
  hospitalId: string;
  hospitalStatus: HospitalStatus;
  assignedOsmUserId: string | null;
};

function hasActiveDirectHospitalScope(
  actor: ActorContext,
  hospitalId: string,
): boolean {
  return actor.hospitalMemberships.some(
    (membership) =>
      membership.hospitalId === hospitalId &&
      (membership.membershipType === MembershipType.OWNER ||
        membership.membershipType === MembershipType.MEMBER) &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospitalStatus === HospitalStatus.ACTIVE,
  );
}

function hasActiveOsmAssignmentScope(
  actor: ActorContext,
  target: ScreeningPolicyTarget,
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

export function decideScreeningPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: ScreeningPolicyTarget;
}): ScreeningPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    input.capability !== SCREENING_READ_CAPABILITY &&
    input.capability !== SCREENING_SUBMIT_CAPABILITY
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
    hasActiveDirectHospitalScope(input.actor, input.target.hospitalId) &&
    input.actor.roles.includes(Role.HOSPITAL)
  ) {
    return { allowed: true, reason: "active_direct_hospital_scope" };
  }

  if (input.actor.roles.includes(Role.OSM) && hasActiveOsmAssignmentScope(input.actor, input.target)) {
    return { allowed: true, reason: "active_osm_assignment_scope" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL) && !input.actor.roles.includes(Role.OSM)) {
    return { allowed: false, reason: "screening_role_required" };
  }

  if (input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "active_direct_hospital_scope_required" };
  }

  return { allowed: false, reason: "active_osm_assignment_scope_required" };
}

export function assertScreeningPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: ScreeningCapability;
  target: ScreeningPolicyTarget;
}): void {
  const decision = decideScreeningPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}
