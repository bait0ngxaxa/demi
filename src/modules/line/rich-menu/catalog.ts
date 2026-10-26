import type { OperationalLineRole } from "../domain/line-types";
import type { LineWebNavigationIntent } from "../domain/line-navigation-intents";
import { LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT } from "../domain/line-reactive-marker";

export const LINE_WORKSPACE_SWITCH_MARKER = "DEMI_LINE_WORKSPACE_SWITCH_V1";

export type LineMenuAction =
  | { type: "uri"; label: string; intent: "LINK_ACCOUNT" | "MANAGE_ACCOUNT" | LineWebNavigationIntent }
  | { type: "richmenuswitch"; label: string; role: OperationalLineRole }
  | { type: "message"; label: string; text: typeof LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT };

export type LineMenuDefinition = {
  key: string;
  alias: string;
  title: string;
  context: string;
  assetFile: string;
  actions: readonly LineMenuAction[];
};

const roleLabels: Record<OperationalLineRole, string> = {
  PATIENT: "ข้อมูลของฉัน",
  OSM: "งาน อสม.",
  HOSPITAL: "งานโรงพยาบาล",
};
const roleMenuContext = (role: OperationalLineRole): string =>
  role === "HOSPITAL" ? "เมนูสำหรับคุณ" : "เลือกงานที่ต้องการ";

const roleIntent = (role: OperationalLineRole): "OPEN_PATIENT_WORKSPACE" | "OPEN_WORK_WORKSPACE" =>
  role === "PATIENT" ? "OPEN_PATIENT_WORKSPACE" : "OPEN_WORK_WORKSPACE";

// A message action shows the Patient's own "นัด" bubble at once; the webhook keyword path answers it.
const appointmentAction: LineMenuAction = {
  type: "message",
  label: "ตรวจสอบนัดหมาย",
  text: LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT,
};

const patientQuickActions: readonly LineMenuAction[] = [
  appointmentAction,
  { type: "uri", intent: "OPEN_PATIENT_APPOINTMENTS", label: "นัดหมายทั้งหมด" },
  { type: "uri", intent: "OPEN_PATIENT_WELLNESS", label: "บันทึกสุขภาพ" },
  { type: "uri", intent: "OPEN_PATIENT_MEDICATIONS", label: "ยาของฉัน" },
  { type: "uri", intent: "OPEN_PATIENT_CARE", label: "ข้อมูลการดูแล" },
];

const osmQuickActions: readonly LineMenuAction[] = [
  { type: "uri", intent: "OPEN_OSM_ASSIGNED_PATIENTS", label: "ผู้ป่วยที่ดูแล" },
  { type: "uri", intent: "START_OSM_SCREENING", label: "คัดกรองผู้ป่วย" },
  { type: "uri", intent: "START_OSM_FOLLOWUP", label: "บันทึกติดตาม" },
  { type: "uri", intent: "OPEN_WORK_WORKSPACE", label: "งานทั้งหมด" },
];

const workspaceSwitchActions = (
  role: OperationalLineRole,
  roles: readonly OperationalLineRole[],
): LineMenuAction[] => roles
  .filter((candidate) => candidate !== role)
  .map((candidate) => ({
    type: "richmenuswitch" as const,
    role: candidate,
    label: roleLabels[candidate],
  }));

const singleRoleActions = (role: OperationalLineRole): LineMenuAction[] => {
  const accountAction: LineMenuAction = {
    type: "uri",
    intent: "MANAGE_ACCOUNT",
    label: "จัดการบัญชี",
  };

  if (role === "PATIENT") {
    return [
      ...patientQuickActions,
      { type: "uri", intent: "OPEN_PATIENT_WORKSPACE", label: "เพิ่มเติม" },
      accountAction,
    ];
  }

  if (role === "OSM") {
    return [
      ...osmQuickActions,
      accountAction,
    ];
  }

  return [
    { type: "uri", intent: roleIntent(role), label: roleLabels[role] },
    accountAction,
  ];
};

const roleMenuActions = (
  role: OperationalLineRole,
  roles: readonly OperationalLineRole[],
): LineMenuAction[] => {
  const accountAction: LineMenuAction = {
    type: "uri",
    intent: "MANAGE_ACCOUNT",
    label: "จัดการบัญชี",
  };
  const switches = workspaceSwitchActions(role, roles);

  if (role === "PATIENT") {
    return [
      ...patientQuickActions,
      { type: "uri", intent: "OPEN_PATIENT_WORKSPACE", label: "เพิ่มเติม" },
      ...switches,
      accountAction,
    ];
  }

  if (role === "OSM") {
    return [
      ...osmQuickActions,
      ...switches,
      accountAction,
    ];
  }

  return [
    { type: "uri", intent: roleIntent(role), label: roleLabels[role] },
    ...switches,
    accountAction,
  ];
};

const roleSets: readonly (readonly OperationalLineRole[])[] = [
  ["PATIENT", "OSM"],
  ["PATIENT", "HOSPITAL"],
  ["OSM", "HOSPITAL"],
  ["PATIENT", "OSM", "HOSPITAL"],
];

const createDefinition = (
  key: string,
  aliasSuffix: string,
  title: string,
  context: string,
  actions: readonly LineMenuAction[],
): LineMenuDefinition => ({
  key,
  alias: `d17j1_${aliasSuffix}`,
  title,
  context,
  assetFile: `${key.toLowerCase()}.png`,
  actions,
});

const baseMenus: LineMenuDefinition[] = [
  createDefinition("UNLINKED", "u", "เชื่อมบัญชี DEMI", "ยังไม่ได้เชื่อมบัญชี", [
    { type: "uri", intent: "LINK_ACCOUNT", label: "เชื่อมบัญชี DEMI" },
  ]),
  createDefinition("LINKED_INELIGIBLE", "i", "จัดการบัญชี", "บัญชีนี้ยังไม่มีเมนูให้ใช้งาน", [
    { type: "uri", intent: "MANAGE_ACCOUNT", label: "จัดการบัญชี" },
  ]),
];

for (const roles of roleSets) {
  const suffix = roles.map((role) => role.slice(0, 1).toLowerCase()).join("");
  const chooserKey = `CHOOSER_${roles.join("_")}`;
  baseMenus.push(
    createDefinition(
      chooserKey,
      `c_${suffix}`,
      "เลือกเมนูที่ต้องการใช้",
      "แตะเมนูที่ต้องการ",
      [
        ...roles.map((role) => ({
          type: "richmenuswitch" as const,
          role,
          label: roleLabels[role],
        })),
        { type: "uri", intent: "MANAGE_ACCOUNT", label: "จัดการบัญชี" },
      ],
    ),
  );
}

for (const roles of [["PATIENT"], ["OSM"], ["HOSPITAL"]] as const) {
  const role = roles[0];
  baseMenus.push(
    createDefinition(
      `${role}_DIRECT`,
      `d_${role.slice(0, 1).toLowerCase()}`,
      roleLabels[role],
      roleMenuContext(role),
      singleRoleActions(role),
    ),
  );
}

for (const roles of roleSets) {
  for (const role of roles) {
    const suffix = roles.map((item) => item.slice(0, 1).toLowerCase()).join("");
    baseMenus.push(
      createDefinition(
        `${role}_${roles.join("_")}`,
        `${role.slice(0, 1).toLowerCase()}_${suffix}`,
        roleLabels[role],
        roleMenuContext(role),
        roleMenuActions(role, roles),
      ),
    );
  }
}

export const LINE_RICH_MENU_CATALOG: readonly LineMenuDefinition[] = baseMenus;
export const LINE_RICH_MENU_BY_KEY = new Map(
  LINE_RICH_MENU_CATALOG.map((menu) => [menu.key, menu]),
);
export const LINE_RICH_MENU_BY_ALIAS = new Map(
  LINE_RICH_MENU_CATALOG.map((menu) => [menu.alias, menu]),
);

export function getLineMenuDefinition(key: string): LineMenuDefinition {
  const menu = LINE_RICH_MENU_BY_KEY.get(key);
  if (!menu) throw new Error("LINE rich menu key is not part of the manifest");
  return menu;
}
