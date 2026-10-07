import { describe, expect, it } from "vitest";

import { LINE_RICH_MENU_CATALOG, LINE_RICH_MENU_BY_KEY } from "./catalog";
import { getLineMenuAreaBounds } from "./layout";

const roleSets = [
  ["PATIENT", "OSM"],
  ["PATIENT", "HOSPITAL"],
  ["OSM", "HOSPITAL"],
  ["PATIENT", "OSM", "HOSPITAL"],
] as const;
const roleLabels = {
  PATIENT: "ข้อมูลของฉัน",
  OSM: "งาน อสม.",
  HOSPITAL: "งานโรงพยาบาล",
} as const;
type MenuRole = keyof typeof roleLabels;

function roleLabel(role: MenuRole | undefined): string {
  if (!role) throw new Error("Expected a role in the Rich Menu test case");
  return roleLabels[role];
}

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
    expect(chooser?.title).toBe("เลือกเมนูที่ต้องการใช้");
    expect(chooser?.context).toBe("แตะเมนูที่ต้องการ");
    const chooserActions = chooser?.actions.filter((action) => action.type === "richmenuswitch");
    expect(chooserActions?.map((action) => action.role)).toEqual(roles);
    expect(chooserActions?.map((action) => action.label)).toEqual(roles.map(roleLabel));
    expect(chooser?.actions.at(-1)).toMatchObject({ type: "uri", intent: "MANAGE_ACCOUNT" });
    for (const selected of roles) {
      const menu = LINE_RICH_MENU_BY_KEY.get(`${selected}_${roles.join("_")}`);
      expect(menu?.actions[0]).toMatchObject({
        type: "uri",
        intent: selected === "PATIENT" ? "OPEN_PATIENT_WORKSPACE" : "OPEN_WORK_WORKSPACE",
      });
      const switchActions = menu?.actions.filter((action) => action.type === "richmenuswitch");
      const remainingRoles = roles.filter((role) => role !== selected);
      expect(switchActions?.map((action) => action.role)).toEqual(remainingRoles);
      expect(switchActions?.map((action) => action.label)).toEqual(remainingRoles.map(roleLabel));
      expect(menu?.actions.at(-1)).toMatchObject({ type: "uri", intent: "MANAGE_ACCOUNT" });
    }
  });

  it("contains no person, role-authority, resource, session, token, or clinical identifiers", () => {
    expect(LINE_RICH_MENU_CATALOG).toHaveLength(18);
    expect(LINE_RICH_MENU_CATALOG.some(({ key }) => key.includes("ADMIN"))).toBe(false);
    expect(JSON.stringify(LINE_RICH_MENU_CATALOG)).not.toMatch(/userId|patientId|hospitalId|national|hn|token|session|clinical/iu);
  });

  it("uses the same task label on each role menu and action", () => {
    expect(LINE_RICH_MENU_BY_KEY.get("PATIENT_DIRECT")?.title).toBe("ข้อมูลของฉัน");
    expect(LINE_RICH_MENU_BY_KEY.get("OSM_DIRECT")?.title).toBe("งาน อสม.");
    expect(LINE_RICH_MENU_BY_KEY.get("HOSPITAL_DIRECT")?.title).toBe("งานโรงพยาบาล");
    expect(LINE_RICH_MENU_CATALOG.every(({ context }) => !context.includes("พื้นที่ใช้งาน"))).toBe(true);
  });

  it("keeps each visible action label in a positive region inside the Rich Menu canvas", () => {
    for (const menu of LINE_RICH_MENU_CATALOG) {
      const bounds = getLineMenuAreaBounds(menu);
      expect(bounds).toHaveLength(menu.actions.length);

      for (const [index, action] of menu.actions.entries()) {
        const region = bounds[index];
        expect(action.label.trim().length).toBeGreaterThan(0);
        if (!region) throw new Error(`Missing action region for ${menu.key}`);
        expect(region.x).toBeGreaterThanOrEqual(0);
        expect(region.y).toBeGreaterThanOrEqual(0);
        expect(region.width).toBeGreaterThan(0);
        expect(region.height).toBeGreaterThan(0);
        expect(region.x + region.width).toBeLessThanOrEqual(2500);
        expect(region.y + region.height).toBeLessThanOrEqual(1686);
      }
    }
  });
});
