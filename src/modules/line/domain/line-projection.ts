import type { LineWorkspaceRole } from "@prisma/client";

import {
  OPERATIONAL_LINE_ROLES,
  type LineBindingProjectionInput,
  type LineMenuProjection,
  type OperationalLineRole,
} from "./line-types";

export function normalizeEligibleLineRoles(
  roles: readonly string[],
): readonly OperationalLineRole[] {
  return OPERATIONAL_LINE_ROLES.filter((role) => roles.includes(role));
}

function chooserKey(roles: readonly OperationalLineRole[]): string {
  return `CHOOSER_${roles.join("_")}`;
}

function roleMenuKey(
  roles: readonly OperationalLineRole[],
  role: OperationalLineRole,
): string {
  return roles.length === 1 ? `${role}_DIRECT` : `${role}_${roles.join("_")}`;
}

export function projectLineMenu(input: LineBindingProjectionInput): LineMenuProjection {
  if (!input.hasBinding || !input.active) {
    return { menuKey: "UNLINKED", workspaceRole: null, eligibleRoles: [] };
  }

  const eligibleRoles = normalizeEligibleLineRoles(input.eligibleRoles);
  if (!input.userActive || eligibleRoles.length === 0) {
    return { menuKey: "LINKED_INELIGIBLE", workspaceRole: null, eligibleRoles };
  }

  if (eligibleRoles.length === 1) {
    const workspaceRole = eligibleRoles[0];
    return { menuKey: roleMenuKey(eligibleRoles, workspaceRole), workspaceRole, eligibleRoles };
  }

  const preference = input.presentationRole as OperationalLineRole | null;
  if (preference && eligibleRoles.includes(preference)) {
    return {
      menuKey: roleMenuKey(eligibleRoles, preference),
      workspaceRole: preference,
      eligibleRoles,
    };
  }

  return { menuKey: chooserKey(eligibleRoles), workspaceRole: null, eligibleRoles };
}

export function isLineRoleEligibleNow(
  role: LineWorkspaceRole | string,
  eligibleRoles: readonly OperationalLineRole[],
): role is OperationalLineRole {
  return (
    (role === "PATIENT" || role === "OSM" || role === "HOSPITAL") &&
    eligibleRoles.includes(role)
  );
}

export function nextReachabilityObservation(
  current: { state: "UNKNOWN" | "FRIEND" | "NOT_FRIEND"; observedAt: Date | null },
  incoming: { state: "FRIEND" | "NOT_FRIEND"; observedAt: Date },
): "ACCEPT" | "IGNORE" | "CONFLICT" {
  if (!current.observedAt || incoming.observedAt > current.observedAt) return "ACCEPT";
  if (incoming.observedAt < current.observedAt) return "IGNORE";
  return current.state === incoming.state ? "IGNORE" : "CONFLICT";
}
