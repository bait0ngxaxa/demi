import { describe, expect, it } from "vitest";

import { LINE_RICH_MENU_CATALOG } from "../rich-menu/catalog";
import { nextReachabilityObservation, projectLineMenu } from "./line-projection";

describe("LINE presentation projection", () => {
  it("has exactly 18 shared menu definitions and stable unique aliases", () => {
    expect(LINE_RICH_MENU_CATALOG).toHaveLength(18);
    expect(new Set(LINE_RICH_MENU_CATALOG.map(({ key }) => key)).size).toBe(18);
    expect(new Set(LINE_RICH_MENU_CATALOG.map(({ alias }) => alias)).size).toBe(18);
    expect(LINE_RICH_MENU_CATALOG.every(({ alias }) => alias.length <= 32)).toBe(true);
  });

  it.each([
    [[], "LINKED_INELIGIBLE"],
    [["PATIENT"], "PATIENT_DIRECT"],
    [["OSM"], "OSM_DIRECT"],
    [["HOSPITAL"], "HOSPITAL_DIRECT"],
    [["PATIENT", "OSM"], "CHOOSER_PATIENT_OSM"],
    [["PATIENT", "HOSPITAL"], "CHOOSER_PATIENT_HOSPITAL"],
    [["OSM", "HOSPITAL"], "CHOOSER_OSM_HOSPITAL"],
    [["PATIENT", "OSM", "HOSPITAL"], "CHOOSER_PATIENT_OSM_HOSPITAL"],
  ] as const)("projects %j without role precedence", (roles, expectedMenu) => {
    const result = projectLineMenu({
      hasBinding: true,
      active: true,
      userActive: true,
      eligibleRoles: roles,
      presentationRole: null,
    });
    expect(result.menuKey).toBe(expectedMenu);
  });

  it("projects ADMIN-only and ADMIN plus operational roles from operational eligibility only", () => {
    expect(projectLineMenu({ hasBinding: true, active: true, userActive: true, eligibleRoles: [], presentationRole: null }).menuKey).toBe("LINKED_INELIGIBLE");
    expect(projectLineMenu({ hasBinding: true, active: true, userActive: true, eligibleRoles: ["HOSPITAL"], presentationRole: null }).menuKey).toBe("HOSPITAL_DIRECT");
  });

  it("uses a remembered role only while it is currently eligible", () => {
    expect(projectLineMenu({
      hasBinding: true,
      active: true,
      userActive: true,
      eligibleRoles: ["PATIENT", "OSM", "HOSPITAL"],
      presentationRole: "OSM",
    })).toMatchObject({ menuKey: "OSM_PATIENT_OSM_HOSPITAL", workspaceRole: "OSM" });
    expect(projectLineMenu({
      hasBinding: true,
      active: true,
      userActive: true,
      eligibleRoles: ["PATIENT", "HOSPITAL"],
      presentationRole: "OSM",
    })).toMatchObject({ menuKey: "CHOOSER_PATIENT_HOSPITAL", workspaceRole: null });
    expect(projectLineMenu({
      hasBinding: true,
      active: true,
      userActive: true,
      eligibleRoles: ["PATIENT"],
      presentationRole: "HOSPITAL",
    }).menuKey).toBe("PATIENT_DIRECT");
  });

  it("keeps absent or inactive bindings neutral", () => {
    expect(projectLineMenu({ hasBinding: false, active: false, userActive: true, eligibleRoles: ["PATIENT"], presentationRole: "PATIENT" }).menuKey).toBe("UNLINKED");
    expect(projectLineMenu({ hasBinding: true, active: false, userActive: true, eligibleRoles: ["PATIENT"], presentationRole: "PATIENT" }).menuKey).toBe("UNLINKED");
    expect(projectLineMenu({ hasBinding: true, active: true, userActive: false, eligibleRoles: ["PATIENT"], presentationRole: "PATIENT" }).menuKey).toBe("LINKED_INELIGIBLE");
  });

  it("uses provider timestamps and makes equal conflicting reachability unknown", () => {
    const first = new Date("2026-10-01T00:00:00Z");
    const later = new Date("2026-10-01T00:00:01Z");
    expect(nextReachabilityObservation({ state: "UNKNOWN", observedAt: null }, { state: "FRIEND", observedAt: first })).toBe("ACCEPT");
    expect(nextReachabilityObservation({ state: "FRIEND", observedAt: later }, { state: "NOT_FRIEND", observedAt: first })).toBe("IGNORE");
    expect(nextReachabilityObservation({ state: "FRIEND", observedAt: first }, { state: "NOT_FRIEND", observedAt: first })).toBe("CONFLICT");
    expect(nextReachabilityObservation({ state: "FRIEND", observedAt: first }, { state: "FRIEND", observedAt: first })).toBe("IGNORE");
  });
});
