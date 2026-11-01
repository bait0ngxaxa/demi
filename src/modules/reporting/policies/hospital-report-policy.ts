import { HospitalStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { findActiveHospitalOperatorMembership } from "@/modules/identity/services/hospital-authority";
import { ForbiddenError } from "@/shared/errors/application-error";

export const HOSPITAL_REPORT_CAPABILITIES = {
  dashboardRead: "hospital:report:dashboard:read",
  rowRead: "hospital:report:row:read",
  export: "hospital:report:export",
} as const;

export type HospitalReportCapability =
  (typeof HOSPITAL_REPORT_CAPABILITIES)[keyof typeof HOSPITAL_REPORT_CAPABILITIES];

export type HospitalReportPolicyTarget = {
  hospitalId: string;
  hospitalStatus: HospitalStatus;
};

export type HospitalReportPolicyDecision =
  | { allowed: true; reason: "active_direct_hospital_owner" | "active_direct_hospital_member" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "hospital_role_required"
        | "active_direct_membership_required"
        | "inactive_target_hospital";
    };

const allowedCapabilities = new Set<HospitalReportCapability>(
  Object.values(HOSPITAL_REPORT_CAPABILITIES),
);

export function decideHospitalReportPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: HospitalReportPolicyTarget;
}): HospitalReportPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (
    typeof input.capability !== "string" ||
    !allowedCapabilities.has(input.capability as HospitalReportCapability)
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (!input.target.hospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  // ADR-0026: every ACTIVE OWNER or MEMBER reads the dashboard and rows and exports either cohort.
  const membership = findActiveHospitalOperatorMembership(input.actor, input.target.hospitalId);
  if (!membership) {
    return { allowed: false, reason: "active_direct_membership_required" };
  }

  if (input.target.hospitalStatus !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "inactive_target_hospital" };
  }

  return {
    allowed: true,
    reason: membership.membershipType === MembershipType.OWNER ? "active_direct_hospital_owner" : "active_direct_hospital_member",
  };
}

export function assertHospitalReportPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: HospitalReportCapability;
  target: HospitalReportPolicyTarget;
}): void {
  if (!decideHospitalReportPolicy(input).allowed) {
    throw new ForbiddenError();
  }
}

export const hospitalReportPolicyInternals = { allowedCapabilities };
