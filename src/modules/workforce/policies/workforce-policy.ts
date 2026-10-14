import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import { ForbiddenError } from "@/shared/errors/application-error";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const WORKFORCE_CAPABILITIES = {
  release: "workforce:release",
  read: "membership:read",
  create: "membership:create",
  update: "membership:update",
  suspend: "membership:suspend",
  restore: "membership:restore",
  osmProvision: "osm:provision",
  activationRevoke: "activation:revoke",
  osmRead: "osm:read",
  osmSuspend: "osm:suspend",
  osmRestore: "osm:restore",
} as const;

export type WorkforceCapability =
  (typeof WORKFORCE_CAPABILITIES)[keyof typeof WORKFORCE_CAPABILITIES];

// ADR-0008 amendment 2026-10-14 (D1): an ACTIVE direct MEMBER may provision and read OSM only.
const MEMBER_OSM_CAPABILITIES: ReadonlySet<WorkforceCapability> = new Set<WorkforceCapability>([
  WORKFORCE_CAPABILITIES.osmProvision,
  WORKFORCE_CAPABILITIES.osmRead,
]);

export type WorkforcePolicyDecision =
  | { allowed: true; reason: "active_hospital_owner" | "active_hospital_member_osm_access" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "hospital_role_required"
        | "active_owner_membership_required"
        | "active_hospital_required"
        | "invalid_target_hospital";
    };

const capabilityValues = new Set<WorkforceCapability>(Object.values(WORKFORCE_CAPABILITIES));

export function decideWorkforcePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  targetHospitalId: unknown;
}): WorkforcePolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    typeof input.capability !== "string" ||
    !capabilityValues.has(input.capability as WorkforceCapability)
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (typeof input.targetHospitalId !== "string" || !input.targetHospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  const targetHospitalId = input.targetHospitalId;
  const capability = input.capability as WorkforceCapability;
  const memberships = input.actor.hospitalMemberships.filter(
    (candidate) =>
      candidate.hospitalId === targetHospitalId && candidate.status === MembershipStatus.ACTIVE,
  );
  const ownerMembership = memberships.find(
    (candidate) => candidate.membershipType === MembershipType.OWNER,
  );

  if (ownerMembership) {
    if (ownerMembership.hospitalStatus !== HospitalStatus.ACTIVE) {
      return { allowed: false, reason: "active_hospital_required" };
    }

    return { allowed: true, reason: "active_hospital_owner" };
  }

  const memberMembership = memberships.find(
    (candidate) => candidate.membershipType === MembershipType.MEMBER,
  );

  if (!memberMembership || !MEMBER_OSM_CAPABILITIES.has(capability)) {
    return { allowed: false, reason: "active_owner_membership_required" };
  }

  if (memberMembership.hospitalStatus !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "active_hospital_required" };
  }

  return { allowed: true, reason: "active_hospital_member_osm_access" };
}

export function assertWorkforcePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: WorkforceCapability;
  targetHospitalId: string;
}): void {
  const decision = decideWorkforcePolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const workforcePolicyInternals = { capabilityValues };
