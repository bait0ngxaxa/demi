import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PATIENT_READ_CAPABILITY = "patient:read" as const;

export type PatientReadCapability = typeof PATIENT_READ_CAPABILITY;

export type PatientReadPolicyDecision =
  | {
      allowed: true;
      reason: "active_direct_hospital_scope";
    }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "hospital_role_required"
        | "active_direct_hospital_scope_required";
    };

function isActiveDirectHospitalScope(
  membership: Pick<ActorContext["hospitalMemberships"][number], "membershipType" | "status" | "hospitalStatus">,
): boolean {
  return (
    (membership.membershipType === MembershipType.OWNER ||
      membership.membershipType === MembershipType.MEMBER) &&
    membership.status === MembershipStatus.ACTIVE &&
    membership.hospitalStatus === HospitalStatus.ACTIVE
  );
}

export function hasDirectHospitalPatientReadScope(
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

export function decidePatientReadPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  targetHospitalId: unknown;
}): PatientReadPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (input.capability !== PATIENT_READ_CAPABILITY) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (typeof input.targetHospitalId !== "string" || !input.targetHospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  if (hasDirectHospitalPatientReadScope(input.actor, input.targetHospitalId.trim())) {
    return { allowed: true, reason: "active_direct_hospital_scope" };
  }

  return { allowed: false, reason: "active_direct_hospital_scope_required" };
}

export function assertPatientReadPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: PatientReadCapability;
  targetHospitalId: string;
}): void {
  const decision = decidePatientReadPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

export const patientDirectoryPolicyInternals = {
  isActiveDirectHospitalScope,
};
