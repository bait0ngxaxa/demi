import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hospitalReportHospitalIdSchema } from "@/modules/reporting/schemas/hospital-report-schemas";

// ADR-0013 (RPT-32): export is a distinct capability for the same nine-value summary; it is never derived from
// `reportExportGrantedAt` (ก-15), so a Parent MEMBER with an export grant still fails the OWNER check below.
export const HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES = {
  read: "hospital-network:child-report:read",
  export: "hospital-network:child-report:export",
} as const;

export type HospitalNetworkChildReportCapability =
  (typeof HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES)[keyof typeof HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES];

export type HospitalNetworkChildReportHierarchy = {
  parent: {
    id: string;
    status: HospitalStatus;
    parentHospitalId: string | null;
  };
  child: {
    id: string;
    status: HospitalStatus;
    parentHospitalId: string | null;
  };
  issues: readonly { code: string }[];
};

export type HospitalNetworkChildReportPolicyDecision =
  | { allowed: true; reason: "active_parent_owner_direct_child_report" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "hospital_role_required"
        | "active_parent_owner_required"
        | "invalid_hospital_scope"
        | "inactive_parent_hospital"
        | "inactive_child_hospital";
    };

const allowedCapabilities = new Set<HospitalNetworkChildReportCapability>(
  Object.values(HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES),
);

export function decideHospitalNetworkChildReportPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  hierarchy: HospitalNetworkChildReportHierarchy;
}): HospitalNetworkChildReportPolicyDecision {
  if (!input.actor) return { allowed: false, reason: "missing_actor" };

  if (
    typeof input.capability !== "string" ||
    !allowedCapabilities.has(input.capability as HospitalNetworkChildReportCapability)
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  const { parent, child, issues } = input.hierarchy;
  const parentId = hospitalReportHospitalIdSchema.safeParse(parent.id);
  const childId = hospitalReportHospitalIdSchema.safeParse(child.id);
  if (
    !parentId.success ||
    !childId.success ||
    parentId.data === childId.data ||
    parent.parentHospitalId !== null ||
    child.parentHospitalId !== parentId.data ||
    issues.length > 0
  ) {
    return { allowed: false, reason: "invalid_hospital_scope" };
  }

  const activeParentOwner = input.actor.hospitalMemberships.some(
    (membership) =>
      membership.hospitalId.toLowerCase() === parentId.data &&
      membership.membershipType === MembershipType.OWNER &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospitalStatus === HospitalStatus.ACTIVE,
  );
  if (!activeParentOwner) return { allowed: false, reason: "active_parent_owner_required" };

  if (parent.status !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "inactive_parent_hospital" };
  }

  if (child.status !== HospitalStatus.ACTIVE) {
    return { allowed: false, reason: "inactive_child_hospital" };
  }

  return { allowed: true, reason: "active_parent_owner_direct_child_report" };
}
