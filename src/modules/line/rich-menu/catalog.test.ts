import { describe, expect, it } from "vitest";

import { LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT } from "../domain/line-reactive-marker";
import { LINE_RICH_MENU_CATALOG, LINE_RICH_MENU_BY_KEY } from "./catalog";
import { getLineMenuLayout } from "./layout";

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
const appointmentMessage = { type: "message", label: "ตรวจสอบนัดหมาย", text: "นัด" } as const;
const patientQuickActions = [
  appointmentMessage,
  { type: "uri", intent: "OPEN_PATIENT_APPOINTMENTS", label: "นัดหมายทั้งหมด" },
  { type: "uri", intent: "OPEN_PATIENT_WELLNESS", label: "บันทึกสุขภาพ" },
  { type: "uri", intent: "OPEN_PATIENT_MEDICATIONS", label: "ยาของฉัน" },
  { type: "uri", intent: "OPEN_PATIENT_CARE", label: "ข้อมูลการดูแล" },
] as const;
const osmQuickActions = [
  { type: "uri", intent: "OPEN_OSM_ASSIGNED_PATIENTS", label: "ผู้ป่วยที่ดูแล" },
  { type: "uri", intent: "START_OSM_SCREENING", label: "คัดกรองผู้ป่วย" },
  { type: "uri", intent: "START_OSM_FOLLOWUP", label: "บันทึกติดตาม" },
  { type: "uri", intent: "OPEN_WORK_WORKSPACE", label: "งานทั้งหมด" },
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
      const appointmentActions = menu?.actions.filter((action) => action.type === "message");
      expect(appointmentActions).toEqual(selected === "PATIENT" ? [appointmentMessage] : []);
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

  it("preserves every catalog key and keeps Manage Account as one ordinary utility action", () => {
    expect(LINE_RICH_MENU_CATALOG.map(({ key }) => key)).toEqual([
      "UNLINKED",
      "LINKED_INELIGIBLE",
      "CHOOSER_PATIENT_OSM",
      "CHOOSER_PATIENT_HOSPITAL",
      "CHOOSER_OSM_HOSPITAL",
      "CHOOSER_PATIENT_OSM_HOSPITAL",
      "PATIENT_DIRECT",
      "OSM_DIRECT",
      "HOSPITAL_DIRECT",
      "PATIENT_PATIENT_OSM",
      "OSM_PATIENT_OSM",
      "PATIENT_PATIENT_HOSPITAL",
      "HOSPITAL_PATIENT_HOSPITAL",
      "OSM_OSM_HOSPITAL",
      "HOSPITAL_OSM_HOSPITAL",
      "PATIENT_PATIENT_OSM_HOSPITAL",
      "OSM_PATIENT_OSM_HOSPITAL",
      "HOSPITAL_PATIENT_OSM_HOSPITAL",
    ]);

    for (const menu of LINE_RICH_MENU_CATALOG) {
      const accountActions = menu.actions.filter(
        (action) => action.type === "uri" && action.intent === "MANAGE_ACCOUNT",
      );
      expect(accountActions, menu.key).toHaveLength(menu.key === "UNLINKED" ? 0 : 1);
    }
  });

  it("adds the exact appointment message action only to the four Patient presentation menus", () => {
    const eligibleKeys = LINE_RICH_MENU_CATALOG
      .filter((menu) => menu.actions.some((action) => action.type === "message"))
      .map((menu) => menu.key);
    expect(eligibleKeys).toEqual([
      "PATIENT_DIRECT",
      "PATIENT_PATIENT_OSM",
      "PATIENT_PATIENT_HOSPITAL",
      "PATIENT_PATIENT_OSM_HOSPITAL",
    ]);
    expect(LINE_RICH_MENU_CATALOG).toHaveLength(18);
    expect(LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT).toBe("นัด");
    const actionTypes = new Set(LINE_RICH_MENU_CATALOG.flatMap(({ actions }) => actions.map(({ type }) => type)));
    expect(actionTypes).toEqual(new Set(["uri", "richmenuswitch", "message"]));
  });

  it("uses the same task label on each role menu and action", () => {
    expect(LINE_RICH_MENU_BY_KEY.get("PATIENT_DIRECT")?.title).toBe("ข้อมูลของฉัน");
    expect(LINE_RICH_MENU_BY_KEY.get("OSM_DIRECT")?.title).toBe("งาน อสม.");
    expect(LINE_RICH_MENU_BY_KEY.get("HOSPITAL_DIRECT")?.title).toBe("งานโรงพยาบาล");
    expect(LINE_RICH_MENU_CATALOG.every(({ context }) => !context.includes("พื้นที่ใช้งาน"))).toBe(true);
  });

  it("places each catalog action once and keeps Manage Account out of the primary grid", () => {
    for (const menu of LINE_RICH_MENU_CATALOG) {
      const layout = getLineMenuLayout(menu);
      expect(layout.actionAreas).toHaveLength(menu.actions.length);
      expect(layout.actionAreas.map(({ action }) => action)).toEqual(menu.actions);

      const primary = layout.actionAreas.filter(({ region }) => region === "primary");
      const utility = layout.actionAreas.filter(({ region }) => region === "utility");
      expect(primary.some(({ action }) => action.type === "uri" && action.intent === "MANAGE_ACCOUNT")).toBe(false);
      expect(utility.map(({ action }) => action)).toEqual(menu.actions.filter(
        (action) => action.type === "uri" && action.intent === "MANAGE_ACCOUNT",
      ));
      expect(utility).toHaveLength(menu.key === "UNLINKED" ? 0 : 1);
      expect(layout.statusRegion !== null).toBe(menu.key === "LINKED_INELIGIBLE");

      for (const { action, bounds } of layout.actionAreas) {
        expect(action.label.trim().length).toBeGreaterThan(0);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.width).toBeGreaterThan(0);
        expect(bounds.height).toBeGreaterThan(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(2500);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(1686);
      }
    }
  });

  it("keeps every constructed action rectangle non-overlapping, integral, and on canvas", () => {
    for (const menu of LINE_RICH_MENU_CATALOG) {
      const areas = getLineMenuLayout(menu).actionAreas;
      for (const [firstIndex, { bounds: first }] of areas.entries()) {
        expect(Number.isInteger(first.x)).toBe(true);
        expect(Number.isInteger(first.y)).toBe(true);
        expect(Number.isInteger(first.width)).toBe(true);
        expect(Number.isInteger(first.height)).toBe(true);
        expect(first.x).toBeGreaterThanOrEqual(0);
        expect(first.y).toBeGreaterThanOrEqual(0);
        expect(first.x + first.width).toBeLessThanOrEqual(2500);
        expect(first.y + first.height).toBeLessThanOrEqual(1686);
        for (const { bounds: second } of areas.slice(firstIndex + 1)) {
          const overlaps = first.x < second.x + second.width &&
            first.x + first.width > second.x &&
            first.y < second.y + second.height &&
            first.y + first.height > second.y;
          expect(overlaps).toBe(false);
        }
      }
    }
  });

  it.each([
    ["UNLINKED", 1, 1],
    ["HOSPITAL_DIRECT", 1, 1],
    ["CHOOSER_PATIENT_OSM", 2, 1],
    ["CHOOSER_PATIENT_OSM_HOSPITAL", 3, 1],
    ["OSM_DIRECT", 2, 2],
    ["OSM_PATIENT_OSM", 3, 2],
    ["PATIENT_DIRECT", 3, 2],
    ["PATIENT_PATIENT_OSM", 4, 2],
    ["PATIENT_PATIENT_OSM_HOSPITAL", 4, 2],
  ] as const)("centers square primary cards in %s using %i columns and %i rows", (key, columns, rows) => {
    const menu = LINE_RICH_MENU_BY_KEY.get(key);
    if (!menu) throw new Error(`Missing menu ${key}`);
    const layout = getLineMenuLayout(menu);
    const bounds = layout.actionAreas
      .filter(({ region }) => region === "primary")
      .map(({ bounds: area }) => area);
    expect(new Set(bounds.map(({ y }) => y)).size).toBe(rows);
    expect(bounds.filter(({ y }) => y === bounds[0]?.y)).toHaveLength(columns);
    expect(new Set(bounds.map(({ width }) => width)).size).toBe(1);
    for (const region of bounds) {
      expect(region.width).toBe(region.height);
      // At the smallest preview width every card remains larger than 44px.
      expect(region.width * 360 / 2500).toBeGreaterThanOrEqual(44);
    }
    if (menu.actions.some((action) => action.type === "uri" && action.intent === "MANAGE_ACCOUNT")) {
      const footer = layout.actionAreas.find(({ region }) => region === "utility");
      if (!footer) throw new Error(`Missing utility footer for ${menu.key}`);
      expect(footer.bounds).toEqual({ x: 80, y: 1366, width: 2340, height: 320 });
      expect(footer.bounds.height * 360 / 2500).toBeGreaterThanOrEqual(44);
      expect(bounds.every((region) => region.y + region.height <= 1326)).toBe(true);
    }
    for (const y of new Set(bounds.map((region) => region.y))) {
      const row = bounds.filter((region) => region.y === y);
      const first = row[0];
      const last = row.at(-1);
      if (!first || !last) throw new Error("Expected a nonempty row");
      expect(Math.abs(first.x - (2500 - last.x - last.width))).toBeLessThanOrEqual(1);
      for (const [index, region] of row.entries()) {
        const next = row[index + 1];
        if (next) expect(next.x - region.x - region.width).toBe(24);
      }
    }
  });

  it("gives one and two actions larger cards than denser menus", () => {
    const size = (key: string): number => {
      const menu = LINE_RICH_MENU_BY_KEY.get(key);
      if (!menu) throw new Error(`Missing menu ${key}`);
      return getLineMenuLayout(menu).actionAreas.find(({ region }) => region === "primary")?.bounds.width ?? 0;
    };
    expect(size("UNLINKED")).toBe(size("HOSPITAL_DIRECT"));
    expect(size("HOSPITAL_DIRECT")).toBe(size("CHOOSER_PATIENT_OSM"));
    expect(size("CHOOSER_PATIENT_OSM")).toBeGreaterThan(size("PATIENT_DIRECT"));
    expect(size("PATIENT_DIRECT")).toBe(size("PATIENT_PATIENT_OSM_HOSPITAL"));
  });
});
