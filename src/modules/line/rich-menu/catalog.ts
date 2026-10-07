import type { OperationalLineRole } from "../domain/line-types";

export const LINE_WORKSPACE_SWITCH_MARKER = "DEMI_LINE_WORKSPACE_SWITCH_V1";

export type LineMenuAction =
  | { type: "uri"; label: string; intent: "LINK_ACCOUNT" | "MANAGE_ACCOUNT" | "OPEN_PATIENT_WORKSPACE" | "OPEN_WORK_WORKSPACE" }
  | { type: "richmenuswitch"; label: string; role: OperationalLineRole };

export type LineMenuDefinition = {
  key: string;
  alias: string;
  title: string;
  context: string;
  assetFile: string;
  actions: readonly LineMenuAction[];
};

const roleLabels: Record<OperationalLineRole, string> = {
  PATIENT: "พื้นที่ส่วนตัว",
  OSM: "งานดูแลพื้นที่",
  HOSPITAL: "งานโรงพยาบาล",
};

const roleIntent = (role: OperationalLineRole): "OPEN_PATIENT_WORKSPACE" | "OPEN_WORK_WORKSPACE" =>
  role === "PATIENT" ? "OPEN_PATIENT_WORKSPACE" : "OPEN_WORK_WORKSPACE";

const singleRoleActions = (role: OperationalLineRole): LineMenuAction[] => [
  { type: "uri", intent: roleIntent(role), label: roleLabels[role] },
  { type: "uri", intent: "MANAGE_ACCOUNT", label: "จัดการบัญชี" },
];

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
  createDefinition("LINKED_INELIGIBLE", "i", "จัดการบัญชี", "บัญชีนี้ยังไม่มีพื้นที่ใช้งาน", [
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
      "เลือกพื้นที่ใช้งาน",
      "เลือกพื้นที่ที่ต้องการ",
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
      "พื้นที่ใช้งานของคุณ",
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
        "พื้นที่ใช้งานของคุณ",
        [
          { type: "uri", intent: roleIntent(role), label: roleLabels[role] },
          ...roles
            .filter((candidate) => candidate !== role)
            .map((candidate) => ({
              type: "richmenuswitch" as const,
              role: candidate,
              label: roleLabels[candidate],
            })),
          { type: "uri", intent: "MANAGE_ACCOUNT", label: "จัดการบัญชี" },
        ],
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
