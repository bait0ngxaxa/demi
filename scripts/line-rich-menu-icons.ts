import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { LineMenuAction, LineMenuDefinition } from "../src/modules/line/rich-menu/catalog";

const intentIcons = {
  LINK_ACCOUNT: "link",
  MANAGE_ACCOUNT: "user-round-cog",
  OPEN_PATIENT_WORKSPACE: "layout-grid",
  OPEN_WORK_WORKSPACE: "layout-grid",
  OPEN_OSM_ASSIGNED_PATIENTS: "users",
  START_OSM_SCREENING: "clipboard-check",
  START_OSM_FOLLOWUP: "notebook-pen",
  OPEN_PATIENT_PROVISIONING: "clipboard-check",
  OPEN_PATIENT_APPOINTMENTS: "calendar-days",
  OPEN_PATIENT_WELLNESS: "heart-pulse",
  OPEN_PATIENT_MEDICATIONS: "pills",
  OPEN_PATIENT_CARE: "stethoscope",
} as const satisfies Record<Extract<LineMenuAction, { type: "uri" }>["intent"], string>;

const roleIcons = { PATIENT: "user-round", OSM: "stethoscope", HOSPITAL: "hospital" } as const;
export type LineRichMenuIcon = typeof intentIcons[keyof typeof intentIcons]
  | typeof roleIcons[keyof typeof roleIcons] | "calendar-check" | "arrow-left-right";

export function getLineRichMenuActionIcon(menu: LineMenuDefinition, action: LineMenuAction): LineRichMenuIcon {
  if (action.type === "postback") return "calendar-check";
  if (action.type === "richmenuswitch") {
    return menu.key.startsWith("CHOOSER_") ? roleIcons[action.role] : "arrow-left-right";
  }
  if (action.intent === "OPEN_WORK_WORKSPACE" && menu.key.startsWith("HOSPITAL_")) return "hospital";
  return intentIcons[action.intent];
}

const iconSources = new Map<LineRichMenuIcon, string>();

export function renderLineRichMenuIcon(icon: LineRichMenuIcon, x: number, y: number, size: number, color: string): string {
  let source = iconSources.get(icon);
  if (source === undefined) {
    source = readFileSync(fileURLToPath(new URL(`./icons/line-rich-menu/${icon}.svg`, import.meta.url)), "utf8");
    iconSources.set(icon, source);
  }
  return source.replace("<svg", `<svg x="${x}" y="${y}"`)
    .replace('width="24"', `width="${size}"`)
    .replace('height="24"', `height="${size}"`)
    .replaceAll("currentColor", color);
}
