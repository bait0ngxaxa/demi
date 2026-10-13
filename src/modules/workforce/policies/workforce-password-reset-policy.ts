import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import { ForbiddenError } from "@/shared/errors/application-error";

import type { ActorContext } from "@/modules/auth/types/actor-context";

// ADR-0008 amendment 2026-10-14 (D3): assisted workforce password reset.
export type WorkforceResetTargetKind = "OSM" | "HOSPITAL_MEMBER" | "HOSPITAL_OWNER";

export type WorkforcePasswordResetDecision =
  | { allowed: true; reason: "active_hospital_owner" | "platform_admin_owner_reset" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_target"
        | "self_reset_denied"
        | "owner_reset_requires_platform_admin"
        | "active_owner_membership_required"
        | "active_hospital_required";
    };

const targetKinds = new Set<WorkforceResetTargetKind>([
  "OSM",
  "HOSPITAL_MEMBER",
  "HOSPITAL_OWNER",
]);

export function decideWorkforcePasswordResetPolicy(input: {
  actor: ActorContext | null | undefined;
  targetUserId: unknown;
  targetHospitalId: unknown;
  targetKind: unknown;
}): WorkforcePasswordResetDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    typeof input.targetUserId !== "string" ||
    !input.targetUserId.trim() ||
    typeof input.targetHospitalId !== "string" ||
    !input.targetHospitalId.trim() ||
    typeof input.targetKind !== "string" ||
    !targetKinds.has(input.targetKind as WorkforceResetTargetKind)
  ) {
    return { allowed: false, reason: "invalid_target" };
  }

  if (input.actor.userId === input.targetUserId) {
    return { allowed: false, reason: "self_reset_denied" };
  }

  const targetKind = input.targetKind as WorkforceResetTargetKind;

  if (targetKind === "HOSPITAL_OWNER") {
    return input.actor.roles.includes(Role.ADMIN)
      ? { allowed: true, reason: "platform_admin_owner_reset" }
      : { allowed: false, reason: "owner_reset_requires_platform_admin" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "active_owner_membership_required" };
  }

  const ownerMembership = input.actor.hospitalMemberships.find(
    (candidate) =>
      candidate.hospitalId === input.targetHospitalId &&
      candidate.membershipType === MembershipType.OWNER &&
      candidate.status === MembershipStatus.ACTIVE,
  );

  if (!ownerMembership) {
    return { allowed: false, reason: "active_owner_membership_required" };
  }

  if (ownerMembership.hospitalStatus !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "active_hospital_required" };
  }

  return { allowed: true, reason: "active_hospital_owner" };
}

export function assertWorkforcePasswordResetPolicy(
  input: Parameters<typeof decideWorkforcePasswordResetPolicy>[0],
): WorkforcePasswordResetDecision & { allowed: true } {
  const decision = decideWorkforcePasswordResetPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }

  return decision;
}
