import type { LineReachability, LineWorkspaceRole } from "@prisma/client";

export const OPERATIONAL_LINE_ROLES = ["PATIENT", "OSM", "HOSPITAL"] as const;
export type OperationalLineRole = (typeof OPERATIONAL_LINE_ROLES)[number];

export type LineEligibleRoles = readonly OperationalLineRole[];

export type LineBindingProjectionInput = {
  hasBinding: boolean;
  active: boolean;
  userActive: boolean;
  eligibleRoles: LineEligibleRoles;
  presentationRole: LineWorkspaceRole | null;
};

export type LineMenuProjection = {
  menuKey: string;
  workspaceRole: OperationalLineRole | null;
  eligibleRoles: LineEligibleRoles;
};

export type LineReachabilityObservation = {
  state: LineReachability;
  observedAt: Date;
};
