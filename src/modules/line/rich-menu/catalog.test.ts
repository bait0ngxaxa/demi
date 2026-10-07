import { describe, expect, it } from "vitest";

import { LINE_RICH_MENU_CATALOG, LINE_RICH_MENU_BY_KEY } from "./catalog";

const roleSets = [
  ["PATIENT", "OSM"],
  ["PATIENT", "HOSPITAL"],
  ["OSM", "HOSPITAL"],
  ["PATIENT", "OSM", "HOSPITAL"],
] as const;
const roleLabels = {
  PATIENT: "พื้นที่ส่วนตัว",
  OSM: "งานดูแลพื้นที่",
  HOSPITAL: "งานโรงพยาบาล",
} as const;

describe("DEMI shared Rich Menu catalog", () => {
  it("exposes only the truthful initial account and workspace actions", () => {
    expect(LINE_RICH_MENU_BY_KEY.get("UNLINKED")?.actions).toEqual([
      { type: "uri", label: "เชื่อมบัญชี DEMI", intent: "LINK_ACCOUNT" },
    ]);
    expect(LINE_RICH_MENU_BY_KEY.get("LINKED_INELIGIBLE")?.actions).toEqual([
      { type: "uri", label: "จัดการบัญชี", intent: "MANAGE_ACCOUNT" },
    ]);

    for (const roles of [["PATIENT"], ["OSM"], ["HOSPITAL"]] as const) {
      const role = roles[0];
      const direct = LINE_RICH_MENU_BY_KEY.get(`${role}_DIRECT`);
      expect(direct?.actions).toEqual([
        { type: "uri", intent: role === "PATIENT" ? "OPEN_PATIENT_WORKSPACE" : "OPEN_WORK_WORKSPACE", label: roleLabels[role] },
        { type: "uri", intent: "MANAGE_ACCOUNT", label: "จัดการบัญชี" },
      ]);
    }
  });

  it.each(roleSets)("provides the exact chooser and workspace variants for %j", (...roles) => {
    const chooser = LINE_RICH_MENU_BY_KEY.get(`CHOOSER_${roles.join("_")}`);
    expect(chooser?.actions.filter((action) => action.type === "richmenuswitch").map((action) => action.role)).toEqual(roles);
    expect(chooser?.actions.at(-1)).toMatchObject({ type: "uri", intent: "MANAGE_ACCOUNT" });
    for (const selected of roles) {
      const menu = LINE_RICH_MENU_BY_KEY.get(`${selected}_${roles.join("_")}`);
      expect(menu?.actions[0]).toMatchObject({
        type: "uri",
        intent: selected === "PATIENT" ? "OPEN_PATIENT_WORKSPACE" : "OPEN_WORK_WORKSPACE",
      });
      expect(menu?.actions.filter((action) => action.type === "richmenuswitch").map((action) => action.role))
        .toEqual(roles.filter((role) => role !== selected));
      expect(menu?.actions.at(-1)).toMatchObject({ type: "uri", intent: "MANAGE_ACCOUNT" });
    }
  });

  it("contains no person, role-authority, resource, session, token, or clinical identifiers", () => {
    expect(LINE_RICH_MENU_CATALOG).toHaveLength(18);
    expect(LINE_RICH_MENU_CATALOG.some(({ key }) => key.includes("ADMIN"))).toBe(false);
    expect(JSON.stringify(LINE_RICH_MENU_CATALOG)).not.toMatch(/userId|patientId|hospitalId|national|hn|token|session|clinical/iu);
  });
});
