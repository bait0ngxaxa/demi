import sharp from "sharp";

import { assertBundledLineRichMenuFont } from "./line-rich-menu-font";
import { renderLineRichMenuIcon, type LineRichMenuIcon } from "./line-rich-menu-icons";
import type { LineMenuBounds } from "../src/modules/line/rich-menu/layout";

export const LINE_RICH_MENU_CANVAS = { width: 2500, height: 1686 } as const;

const colors = {
  canvas: "#F3F7F5",
  ink: "#102620",
  brand: "#0E3C35",
  line: "#AEBFBA",
  surface: "#FFFFFF",
  soft: "#DCEEE9",
} as const;

const thaiLabelLines: Readonly<Record<string, readonly string[]>> = {
  "เชื่อมบัญชี DEMI": ["เชื่อมบัญชี", "DEMI"],
  "ข้อมูลของฉัน": ["ข้อมูล", "ของฉัน"],
  "งานโรงพยาบาล": ["งานโรง", "พยาบาล"],
  "ตรวจสอบนัดหมาย": ["ตรวจสอบ", "นัดหมาย"],
  "นัดหมายทั้งหมด": ["นัดหมาย", "ทั้งหมด"],
  "บันทึกสุขภาพ": ["บันทึก", "สุขภาพ"],
  "ยาของฉัน": ["ยา", "ของฉัน"],
  "ข้อมูลการดูแล": ["ข้อมูล", "การดูแล"],
  "ผู้ป่วยที่ดูแล": ["ผู้ป่วย", "ที่ดูแล"],
  "คัดกรองผู้ป่วย": ["คัดกรอง", "ผู้ป่วย"],
  "บันทึกติดตาม": ["บันทึก", "ติดตาม"],
  "งานทั้งหมด": ["งาน", "ทั้งหมด"],
  "จัดการบัญชี": ["จัดการ", "บัญชี"],
};

const PATIENT_TASK_INTENTS = new Set([
  "OPEN_PATIENT_APPOINTMENTS",
  "OPEN_PATIENT_WELLNESS",
  "OPEN_PATIENT_MEDICATIONS",
  "OPEN_PATIENT_CARE",
]);
const OSM_TASK_INTENTS = new Set([
  "OPEN_OSM_ASSIGNED_PATIENTS",
  "START_OSM_SCREENING",
  "START_OSM_FOLLOWUP",
  "OPEN_WORK_WORKSPACE",
]);

type FontWeight = "Medium" | "Semi-Bold" | "Bold";

type MenuActionManifest = {
  label: string;
  kind: "uri" | "richmenuswitch" | "message";
  intent: string | null;
  icon: LineRichMenuIcon;
  bounds: LineMenuBounds;
};

export type LineRichMenuAssetManifestEntry = {
  key: string;
  title: string;
  context: string;
  assetFile: string;
  actions: readonly MenuActionManifest[];
};

export type LineMenuTextStyle = { fontSize: number; weight: FontWeight; color: string };
type ImageOverlay = { input: Buffer; left: number; top: number };
type TextBox = { x: number; y: number; width: number; height: number };

function escapePangoMarkup(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getFontDescription(style: LineMenuTextStyle): string {
  return `Noto Sans Thai ${style.weight} ${style.fontSize}`;
}

function ensureShapingEngine(): void {
  if (!sharp.versions.pango || !sharp.versions.harfbuzz) {
    throw new Error("Rich Menu asset generation requires Sharp with Pango and HarfBuzz support.");
  }
}

export async function renderThaiTextBuffer(text: string, style: LineMenuTextStyle): Promise<Buffer> {
  ensureShapingEngine();
  const fontFile = assertBundledLineRichMenuFont();
  const markup = `<span lang="th" foreground="${style.color}">${escapePangoMarkup(text)}</span>`;
  return sharp({
    text: {
      text: markup,
      font: getFontDescription(style),
      fontfile: fontFile,
      dpi: 72,
      align: "centre",
      rgba: true,
      spacing: Math.max(4, Math.round(style.fontSize * 0.08)),
    },
  }).png().toBuffer();
}

async function createTextOverlay(
  text: string,
  box: TextBox,
  style: LineMenuTextStyle,
  padding: { horizontal: number; vertical: number },
  purpose: string,
): Promise<ImageOverlay> {
  const image = await renderThaiTextBuffer(text, style);
  const metadata = await sharp(image).metadata();
  if (metadata.width === undefined || metadata.height === undefined) {
    throw new Error(`Could not measure ${purpose}.`);
  }
  const maxWidth = box.width - padding.horizontal * 2;
  const maxHeight = box.height - padding.vertical * 2;
  if (metadata.width > maxWidth || metadata.height > maxHeight) {
    throw new Error(
      `${purpose} measures ${metadata.width}×${metadata.height}px, exceeding its ${maxWidth}×${maxHeight}px text area at ${style.fontSize}px; refusing to shrink or truncate it.`,
    );
  }
  return {
    input: image,
    left: Math.round(box.x + (box.width - metadata.width) / 2),
    top: Math.round(box.y + (box.height - metadata.height) / 2),
  };
}

function isPrimaryAction(
  menu: LineRichMenuAssetManifestEntry,
  action: MenuActionManifest,
  index: number,
): boolean {
  if (menu.key.startsWith("CHOOSER_")) return action.kind === "richmenuswitch";
  if (menu.key.startsWith("PATIENT_")) {
    return action.kind === "message" || (action.intent !== null && PATIENT_TASK_INTENTS.has(action.intent));
  }
  if (menu.key.startsWith("OSM_")) {
    return action.intent !== null && OSM_TASK_INTENTS.has(action.intent);
  }
  return menu.actions.length === 1 || index === 0;
}

function getActionFontSize(action: MenuActionManifest): number {
  return action.bounds.width < 500 ? 104 : action.bounds.width < 800 ? 112 : 144;
}

export function getLineRichMenuActionLines(label: string): readonly string[] {
  return thaiLabelLines[label] ?? [label];
}

function buildBaseSvg(menu: LineRichMenuAssetManifestEntry): string {
  const cards = menu.actions.map((action, index) => {
    const primary = isPrimaryAction(menu, action, index);
    const fill = primary ? colors.soft : colors.surface;
    const { x, y, width, height } = action.bounds;
    const iconSize = Math.min(260, Math.round(width * 0.24));
    const icon = renderLineRichMenuIcon(
      action.icon, x + (width - iconSize) / 2, y + Math.round(height * 0.055), iconSize, colors.brand,
    );
    // Stroke stays inside the shared rectangular LINE bounds. Corners are visual only.
    return `<rect x="${x + 2}" y="${y + 2}" width="${width - 4}" height="${height - 4}" rx="${Math.round(width * 0.08)}" fill="${fill}" stroke="${colors.line}" stroke-width="4"/>${icon}`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LINE_RICH_MENU_CANVAS.width}" height="${LINE_RICH_MENU_CANVAS.height}" viewBox="0 0 2500 1686"><rect width="2500" height="1686" fill="${colors.canvas}"/>${cards}</svg>`;
}

export async function renderLineRichMenuImage(menu: LineRichMenuAssetManifestEntry): Promise<Buffer> {
  ensureShapingEngine();
  assertBundledLineRichMenuFont();
  const overlays: ImageOverlay[] = [];

  overlays.push(await createTextOverlay(
    "DEMI",
    { x: 64, y: 22, width: 320, height: 110 },
    { fontSize: 86, weight: "Bold", color: colors.brand },
    { horizontal: 0, vertical: 2 },
    `${menu.key} brand label`,
  ));
  overlays.push(await createTextOverlay(
    menu.title,
    { x: 440, y: 0, width: 1620, height: 120 },
    { fontSize: 86, weight: "Semi-Bold", color: colors.ink },
    { horizontal: 16, vertical: 2 },
    `${menu.key} title`,
  ));
  overlays.push(await createTextOverlay(
    menu.context,
    { x: 440, y: 114, width: 1620, height: 80 },
    { fontSize: 56, weight: "Medium", color: colors.brand },
    { horizontal: 24, vertical: 2 },
    `${menu.key} context`,
  ));

  for (const action of menu.actions) {
    const fontSize = getActionFontSize(action);
    const style: LineMenuTextStyle = {
      fontSize,
      weight: "Semi-Bold",
      color: colors.ink,
    };
    overlays.push(await createTextOverlay(
      getLineRichMenuActionLines(action.label).join("\n"),
      {
        x: action.bounds.x,
        y: action.bounds.y + Math.round(action.bounds.height * 0.34),
        width: action.bounds.width,
        height: Math.floor(action.bounds.height * 0.64),
      },
      style,
      { horizontal: 24, vertical: 8 },
      `${menu.key} action “${action.label}”`,
    ));
  }

  return sharp(Buffer.from(buildBaseSvg(menu)))
    .composite(overlays)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

export function getLineRichMenuColors(): Readonly<typeof colors> {
  return colors;
}
