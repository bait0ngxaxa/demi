import { describe, expect, it } from "vitest";

import { LINE_PATIENT_NEXT_APPOINTMENT_MARKER } from "../domain/line-reactive-marker";
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
const manageAccount = { type: "uri", intent: "MANAGE_ACCOUNT", label: "จัดการบัญชี" } as const;
const patientQuickActions = [
  { type: "postback", label: "ตรวจสอบนัดหมาย", data: LINE_PATIENT_NEXT_APPOINTMENT_MARKER },
  { type: "uri", intent: "OPEN_PATIENT_APPOINTMENTS", label: "นัดหมายทั้งหมด" },
  { type: "uri", intent: "OPEN_PATIENT_WELLNESS", label: "บันทึกสุขภาพ" },
  { type: "uri", intent: "OPEN_PATIENT_MEDICATIONS", label: "ยาของฉัน" },
  { type: "uri", intent: "OPEN_PATIENT_CARE", label: "ข้อมูลการดูแล" },
] as const;
const osmQuickActions = [
  { type: "uri", intent: "OPEN_OSM_ASSIGNED_PATIENTS", label: "ผู้ป่วยที่ดูแล" },
  { type: "uri", intent: "START_OSM_SCREENING", label: "คัดกรองผู้ป่วย" },
  { type: "uri", intent: "START_OSM_FOLLOWUP", label: "บันทึกติดตาม" },
  { type: "uri", intent: "OPEN_PATIENT_PROVISIONING", label: "เพิ่มผู้ป่วย" },
] as const;

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
      if (role === "PATIENT") {
        expect(direct?.actions).toEqual([
          ...patientQuickActions,
          { type: "uri", intent: "OPEN_PATIENT_WORKSPACE", label: "เพิ่มเติม" },
          manageAccount,
        ]);
      } else if (role === "OSM") {
        expect(direct?.actions).toEqual([
          ...osmQuickActions,
          { type: "uri", intent: "OPEN_WORK_WORKSPACE", label: "งานทั้งหมด" },
          manageAccount,
        ]);
      } else {
        expect(direct?.actions).toEqual([
          { type: "uri", intent: "OPEN_WORK_WORKSPACE", label: roleLabels.HOSPITAL },
          manageAccount,
        ]);
        expect(direct?.context).toBe("เมนูสำหรับคุณ");
      }
    }
  });

  it.each(roleSets)("provides the exact chooser and workspace variants for %j", (...roles) => {
    const chooser = LINE_RICH_MENU_BY_KEY.get(`CHOOSER_${roles.join("_")}`);
    expect(chooser?.title).toBe("เลือกเมนูที่ต้องการใช้");
    expect(chooser?.context).toBe("แตะเมนูที่ต้องการ");
    const chooserActions = chooser?.actions.filter((action) => action.type === "richmenuswitch");
    expect(chooserActions?.map((action) => action.role)).toEqual(roles);
    expect(chooserActions?.map((action) => action.label)).toEqual(roles.map(roleLabel));
    expect(chooser?.actions.at(-1)).toEqual(manageAccount);
    for (const selected of roles) {
      const menu = LINE_RICH_MENU_BY_KEY.get(`${selected}_${roles.join("_")}`);
      expect(menu?.context).toBe(selected === "HOSPITAL" ? "เมนูสำหรับคุณ" : "เลือกงานที่ต้องการ");
      const switchActions = menu?.actions.filter((action) => action.type === "richmenuswitch");
      const appointmentActions = menu?.actions.filter((action) => action.type === "postback");
      expect(appointmentActions).toEqual(selected === "PATIENT"
        ? [{ type: "postback", label: "ตรวจสอบนัดหมาย", data: LINE_PATIENT_NEXT_APPOINTMENT_MARKER }]
        : []);
      const remainingRoles = roles.filter((role) => role !== selected);
      expect(switchActions?.map((action) => action.role)).toEqual(remainingRoles);
      expect(switchActions?.map((action) => action.label)).toEqual(remainingRoles.map(roleLabel));
      const switchDefinitions = remainingRoles.map((role) => ({
        type: "richmenuswitch" as const,
        role,
        label: roleLabel(role),
      }));
      const expectedActions = selected === "PATIENT"
        ? [
          ...patientQuickActions,
          { type: "uri" as const, intent: "OPEN_PATIENT_WORKSPACE" as const, label: "เพิ่มเติม" },
          ...switchDefinitions,
          manageAccount,
        ]
        : selected === "OSM"
          ? [
            ...osmQuickActions,
            { type: "uri" as const, intent: "OPEN_WORK_WORKSPACE" as const, label: "งานทั้งหมด" },
            ...switchDefinitions,
            manageAccount,
          ]
          : [
            { type: "uri" as const, intent: "OPEN_WORK_WORKSPACE" as const, label: roleLabels.HOSPITAL },
            ...switchDefinitions,
            manageAccount,
          ];
      expect(menu?.actions).toEqual(expectedActions);
    }
  });

  it("contains no person, role-authority, resource, session, token, or clinical identifiers", () => {
    expect(LINE_RICH_MENU_CATALOG).toHaveLength(18);
    expect(LINE_RICH_MENU_CATALOG.some(({ key }) => key.includes("ADMIN"))).toBe(false);
    expect(LINE_RICH_MENU_CATALOG.every(({ actions, alias }) => actions.length <= 20 && alias.length <= 32)).toBe(true);
    expect(JSON.stringify(LINE_RICH_MENU_CATALOG)).not.toMatch(/userId|patientId|hospitalId|national|hn|token|session|clinical/iu);
  });

  it("adds the exact appointment postback only to the four Patient presentation menus", () => {
    const eligibleKeys = LINE_RICH_MENU_CATALOG
      .filter((menu) => menu.actions.some((action) => action.type === "postback"))
      .map((menu) => menu.key);
    expect(eligibleKeys).toEqual([
      "PATIENT_DIRECT",
      "PATIENT_PATIENT_OSM",
      "PATIENT_PATIENT_HOSPITAL",
      "PATIENT_PATIENT_OSM_HOSPITAL",
    ]);
    expect(LINE_RICH_MENU_CATALOG).toHaveLength(18);
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

  it("keeps every menu's tappable areas non-overlapping and integral", () => {
    for (const menu of LINE_RICH_MENU_CATALOG) {
      const bounds = getLineMenuAreaBounds(menu);
      for (const [firstIndex, first] of bounds.entries()) {
        expect(Number.isInteger(first.x)).toBe(true);
        expect(Number.isInteger(first.y)).toBe(true);
        expect(Number.isInteger(first.width)).toBe(true);
        expect(Number.isInteger(first.height)).toBe(true);
        expect(first.x).toBeGreaterThanOrEqual(0);
        expect(first.y).toBeGreaterThanOrEqual(0);
        expect(first.x + first.width).toBeLessThanOrEqual(2500);
        expect(first.y + first.height).toBeLessThanOrEqual(1686);
        for (const second of bounds.slice(firstIndex + 1)) {
          const overlaps = first.x < second.x + second.width &&
            first.x + first.width > second.x &&
            first.y < second.y + second.height &&
            first.y + first.height > second.y;
          expect(overlaps).toBe(false);
        }
      }
    }
  });

  it("uses a Patient 2×2 task grid with care as a full-width fifth task", () => {
    const menu = LINE_RICH_MENU_BY_KEY.get("PATIENT_DIRECT");
    if (!menu) throw new Error("Missing direct Patient menu");
    const bounds = getLineMenuAreaBounds(menu);
    const primaryGrid = bounds.slice(0, 4);
    const careBounds = bounds[4];
    const moreBounds = bounds[5];

    expect(new Set(primaryGrid.map(({ x }) => x)).size).toBe(2);
    expect(new Set(primaryGrid.map(({ y }) => y)).size).toBe(2);
    expect(primaryGrid.map(({ y }) => y)).toEqual([314, 314, 618, 618]);
    expect(careBounds).toMatchObject({ x: 48, y: 922, width: 2404, height: 292 });
    expect(moreBounds?.y).toBe(1230);
  });

  it("preserves the existing multi-role chooser and account hit regions", () => {
    const chooser = LINE_RICH_MENU_BY_KEY.get("CHOOSER_PATIENT_OSM_HOSPITAL");
    if (!chooser) throw new Error("Missing three-role chooser");
    const bounds = getLineMenuAreaBounds(chooser);

    expect(bounds.slice(0, 3)).toEqual([
      { x: 0, y: 340, width: 833, height: 980 },
      { x: 833, y: 340, width: 833, height: 980 },
      { x: 1666, y: 340, width: 834, height: 980 },
    ]);
    expect(bounds[3]).toEqual({ x: 100, y: 1360, width: 2300, height: 326 });
  });

  it("keeps OSM tasks in a 2×2 grid and multi-role navigation in a full-height footer row", () => {
    const menu = LINE_RICH_MENU_BY_KEY.get("OSM_PATIENT_OSM_HOSPITAL");
    if (!menu) throw new Error("Missing multi-role OSM menu");
    const bounds = getLineMenuAreaBounds(menu);
    const primaryGrid = bounds.slice(0, 4);
    const footer = bounds.slice(4);

    expect(new Set(primaryGrid.map(({ x }) => x)).size).toBe(2);
    expect(new Set(primaryGrid.map(({ y }) => y)).size).toBe(2);
    expect(primaryGrid.map(({ y }) => y)).toEqual([314, 314, 738, 738]);
    expect(new Set(footer.map(({ x }) => x)).size).toBe(4);
    expect(footer.every(({ y, height }) => y === 1162 && height === 524)).toBe(true);
  });
});
