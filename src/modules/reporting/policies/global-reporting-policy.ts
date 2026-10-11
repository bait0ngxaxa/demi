import { HospitalStatus, Role, UserStatus } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const GLOBAL_REPORTING_CAPABILITIES = {
  workspaceRead: "global:report:workspace:read",
  directoryRead: "global:report:directory:read",
  hospitalRead: "global:report:hospital:read",
  export: "global:report:hospital:export",
} as const;

export type GlobalReportingCapability =
  (typeof GLOBAL_REPORTING_CAPABILITIES)[keyof typeof GLOBAL_REPORTING_CAPABILITIES];

export type GlobalReportingPolicyDecision =
  | { allowed: true; reason: "eligible_active_platform_admin" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "active_admin_required"
        | "invalid_target_hospital"
        | "active_hospital_required";
    };

const allowedCapabilities = new Set<GlobalReportingCapability>(
  Object.values(GLOBAL_REPORTING_CAPABILITIES),
);
const targetHospitalCapabilities = new Set<GlobalReportingCapability>([
  GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
  GLOBAL_REPORTING_CAPABILITIES.export,
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function decideGlobalReportingPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  currentUserStatus: UserStatus | null;
  currentRoles: readonly Role[];
  targetHospitalId?: string;
  targetHospitalStatus?: HospitalStatus;
}): GlobalReportingPolicyDecision {
  if (!input.actor) return { allowed: false, reason: "missing_actor" };

  if (
    typeof input.capability !== "string" ||
    !allowedCapabilities.has(input.capability as GlobalReportingCapability)
  ) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (
    input.currentUserStatus !== UserStatus.ACTIVE ||
    !input.currentRoles.includes(Role.ADMIN)
  ) {
    return { allowed: false, reason: "active_admin_required" };
  }

  if (targetHospitalCapabilities.has(input.capability as GlobalReportingCapability)) {
    if (!input.targetHospitalId || !uuidPattern.test(input.targetHospitalId)) {
      return { allowed: false, reason: "invalid_target_hospital" };
    }
    if (input.targetHospitalStatus !== HospitalStatus.ACTIVE) {
      return { allowed: false, reason: "active_hospital_required" };
    }
  }

  return { allowed: true, reason: "eligible_active_platform_admin" };
}

export const globalReportingPolicyInternals = {
  allowedCapabilities,
  targetHospitalCapabilities,
};
