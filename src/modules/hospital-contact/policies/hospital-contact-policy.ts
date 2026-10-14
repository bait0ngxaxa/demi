import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const HOSPITAL_CONTACT_CAPABILITIES = {
  read: "hospital-contact:read",
  update: "hospital-contact:update",
} as const;

export type HospitalContactCapability =
  (typeof HOSPITAL_CONTACT_CAPABILITIES)[keyof typeof HOSPITAL_CONTACT_CAPABILITIES];

export const HOSPITAL_CONTACT_READ_SCOPES = [
  "DIRECT_HOSPITAL_OWNER",
  "PATIENT_SELF_RELATIONSHIP",
  "WORK_HOSPITAL_RELATIONSHIP",
] as const;

export type HospitalContactScope = (typeof HOSPITAL_CONTACT_READ_SCOPES)[number];

export type HospitalContactPolicyDecision = {
  allowed: boolean;
  reason:
    | "missing_actor"
    | "invalid_capability"
    | "invalid_scope"
    | "authenticated_identity_required"
    | "hospital_role_required"
    | "direct_active_owner_required"
    | "patient_role_required"
    | "patient_self_scope"
    | "direct_hospital_owner_scope"
    | "active_work_hospital_relationship_required"
    | "work_hospital_relationship_scope";
  scope?: HospitalContactScope;
};

function hasDirectActiveOwnerScope(actor: ActorContext, hospitalId: string): boolean {
  return (
    actor.hospitalMemberships.some(
      (membership) =>
        membership.hospitalId === hospitalId &&
        membership.membershipType === MembershipType.OWNER &&
        membership.status === MembershipStatus.ACTIVE &&
        membership.hospitalStatus === HospitalStatus.ACTIVE,
    )
  );
}

function hasActiveWorkHospitalScope(actor: ActorContext, hospitalId?: string): boolean {
  const hasHospitalMembership =
    actor.roles.includes(Role.HOSPITAL) &&
    actor.hospitalMemberships.some(
      (membership) =>
        (hospitalId === undefined || membership.hospitalId === hospitalId) &&
        (membership.membershipType === MembershipType.OWNER ||
          membership.membershipType === MembershipType.MEMBER) &&
        membership.status === MembershipStatus.ACTIVE &&
        membership.hospitalStatus === HospitalStatus.ACTIVE,
    );
  const hasOsmRelationship =
    actor.roles.includes(Role.OSM) &&
    actor.osmHospitalRelationships.some(
      (relationship) =>
        (hospitalId === undefined || relationship.hospitalId === hospitalId) &&
        relationship.status === MembershipStatus.ACTIVE &&
        relationship.hospitalStatus === HospitalStatus.ACTIVE,
    );

  return hasHospitalMembership || hasOsmRelationship;
}

export function decideHospitalContactPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  scope: unknown;
  hospitalId?: string;
}): HospitalContactPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    input.capability !== HOSPITAL_CONTACT_CAPABILITIES.read &&
    input.capability !== HOSPITAL_CONTACT_CAPABILITIES.update
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (
    input.scope !== "DIRECT_HOSPITAL_OWNER" &&
    input.scope !== "PATIENT_SELF_RELATIONSHIP" &&
    input.scope !== "WORK_HOSPITAL_RELATIONSHIP"
  ) {
    return { allowed: false, reason: "invalid_scope" };
  }

  const scope = input.scope;

  if (!input.actor.userId.trim() || !input.actor.personId.trim()) {
    return { allowed: false, reason: "authenticated_identity_required" };
  }

  if (scope === "DIRECT_HOSPITAL_OWNER") {
    if (input.capability === HOSPITAL_CONTACT_CAPABILITIES.update && !input.hospitalId) {
      return { allowed: false, reason: "direct_active_owner_required" };
    }

    if (!input.actor.roles.includes(Role.HOSPITAL)) {
      return { allowed: false, reason: "hospital_role_required" };
    }

    const ownsTarget = input.hospitalId
      ? hasDirectActiveOwnerScope(input.actor, input.hospitalId)
      : input.actor.hospitalMemberships.some(
          (membership) =>
            membership.membershipType === MembershipType.OWNER &&
            membership.status === MembershipStatus.ACTIVE &&
            membership.hospitalStatus === HospitalStatus.ACTIVE,
        );

    return ownsTarget
      ? { allowed: true, reason: "direct_hospital_owner_scope", scope }
      : { allowed: false, reason: "direct_active_owner_required" };
  }

  if (scope === "PATIENT_SELF_RELATIONSHIP") {
    if (input.capability === HOSPITAL_CONTACT_CAPABILITIES.update) {
      return { allowed: false, reason: "invalid_scope" };
    }

    if (!input.actor.roles.includes(Role.PATIENT)) {
      return { allowed: false, reason: "patient_role_required" };
    }

    return { allowed: true, reason: "patient_self_scope", scope };
  }

  if (input.capability === HOSPITAL_CONTACT_CAPABILITIES.update) {
    return { allowed: false, reason: "invalid_scope" };
  }

  return hasActiveWorkHospitalScope(input.actor, input.hospitalId)
    ? { allowed: true, reason: "work_hospital_relationship_scope", scope }
    : { allowed: false, reason: "active_work_hospital_relationship_required" };
}

export function assertHospitalContactPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: HospitalContactCapability;
  scope: HospitalContactScope;
  hospitalId?: string;
}): asserts input is { actor: ActorContext; capability: HospitalContactCapability; scope: HospitalContactScope } {
  if (!decideHospitalContactPolicy(input).allowed) {
    throw new ForbiddenError();
  }
}
