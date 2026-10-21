import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";
import type { HospitalReportCohort } from "../schemas/hospital-report-schemas";

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
  | { allowed: true; reason: "active_direct_hospital_owner" | "active_hospital_member_export" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "hospital_role_required"
        | "active_direct_owner_required"
        | "inactive_target_hospital";
    };

const allowedCapabilities = new Set<HospitalReportCapability>(
  Object.values(HOSPITAL_REPORT_CAPABILITIES),
);

export function decideHospitalReportPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: HospitalReportPolicyTarget;
  cohort?: HospitalReportCohort;
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

  const requestedHospitalId = input.target.hospitalId.toLowerCase();
  const activeMemberships = input.actor.hospitalMemberships.filter(
    (candidate) =>
      candidate.hospitalId.toLowerCase() === requestedHospitalId &&
      candidate.status === MembershipStatus.ACTIVE,
  );
  const ownerMembership = activeMemberships.find(
    (candidate) => candidate.membershipType === MembershipType.OWNER,
  );
  // Product Owner decision 2026-10-21 (amends ADR-0019): every ACTIVE MEMBER may export the
  // ACTIVE cohort without a grant; the dashboard, row reads and INCLUDE_ENDED stay OWNER-only.
  const exportMembership = input.capability === HOSPITAL_REPORT_CAPABILITIES.export
    ? activeMemberships.find((candidate) => candidate.membershipType === MembershipType.MEMBER)
    : undefined;
  if (input.cohort === "INCLUDE_ENDED" && !ownerMembership) {
    return { allowed: false, reason: "active_direct_owner_required" };
  }
  const membership = ownerMembership ?? exportMembership;

  if (!membership) {
    return { allowed: false, reason: "active_direct_owner_required" };
  }

  if (
    input.target.hospitalStatus !== HospitalStatus.ACTIVE ||
    membership.hospitalStatus !== HospitalStatus.ACTIVE
  ) {
    return { allowed: false, reason: "inactive_target_hospital" };
  }

  return {
    allowed: true,
    reason: ownerMembership ? "active_direct_hospital_owner" : "active_hospital_member_export",
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
