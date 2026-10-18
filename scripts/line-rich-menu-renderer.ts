import sharp from "sharp";

import { assertBundledLineRichMenuFont } from "./line-rich-menu-font";
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
  "งานโรงพยาบาล": ["งาน", "โรงพยาบาล"],
  "ตรวจสอบนัดหมาย": ["ตรวจสอบ", "นัดหมาย"],
  "นัดหมายทั้งหมด": ["นัดหมาย", "ทั้งหมด"],
  "บันทึกสุขภาพ": ["บันทึก", "สุขภาพ"],
  "ยาของฉัน": ["ยา", "ของฉัน"],
  "ข้อมูลการดูแล": ["ข้อมูล", "การดูแล"],
  "ผู้ป่วยที่ดูแล": ["ผู้ป่วย", "ที่ดูแล"],
  "คัดกรองผู้ป่วย": ["คัดกรอง", "ผู้ป่วย"],
  "บันทึกติดตาม": ["บันทึก", "ติดตาม"],
  "เพิ่มผู้ป่วย": ["เพิ่ม", "ผู้ป่วย"],
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
  "OPEN_PATIENT_PROVISIONING",
]);

type FontWeight = "Medium" | "Semi-Bold" | "Bold";

type MenuActionManifest = {
  label: string;
  kind: "uri" | "richmenuswitch" | "postback";
  intent: string | null;
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
    return action.kind === "postback" || (action.intent !== null && PATIENT_TASK_INTENTS.has(action.intent));
  }
  if (menu.key.startsWith("OSM_")) {
    return action.intent !== null && OSM_TASK_INTENTS.has(action.intent);
  }
  return menu.actions.length === 1 || index === 0;
}

function getActionFontSize(
  menu: LineRichMenuAssetManifestEntry,
  action: MenuActionManifest,
  index: number,
): number {
  const primary = isPrimaryAction(menu, action, index);
  const { width, height } = action.bounds;

  if (primary && menu.key.startsWith("CHOOSER_") && action.kind === "richmenuswitch") {
    return width < 1000 ? 140 : 170;
  }
  if (primary && (menu.key.startsWith("PATIENT_") || menu.key.startsWith("OSM_"))) {
    return 112;
  }
  if (primary && height > 1000) return 202;
  if (primary && width > 1800) return 186;
  if (primary) return 164;
  if (menu.key.startsWith("PATIENT_") || menu.key.startsWith("OSM_")) {
    return 104;
  }
  if (width > 1800) return 148;
  if (width > 1000) return 142;
  return 132;
}

export function getLineRichMenuActionLines(
  label: string,
  width?: number,
  menuKey?: string,
): readonly string[] {
  if (
    width !== undefined &&
    width >= 700 &&
    (menuKey?.startsWith("PATIENT_") || menuKey?.startsWith("OSM_"))
  ) {
    return [label];
  }
  if (label === "จัดการบัญชี" && width !== undefined && width > 1800) return [label];
  return thaiLabelLines[label] ?? [label];
}

function buildBaseSvg(menu: LineRichMenuAssetManifestEntry): string {
  const actionRects = menu.actions.map((action, index) => {
    const primary = isPrimaryAction(menu, action, index);
    const fill = primary
      ? colors.brand
      : action.kind === "richmenuswitch"
        ? colors.soft
        : colors.surface;
    const stroke = primary ? colors.canvas : colors.line;
    const bounds = action.bounds;
    return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LINE_RICH_MENU_CANVAS.width}" height="${LINE_RICH_MENU_CANVAS.height}" viewBox="0 0 ${LINE_RICH_MENU_CANVAS.width} ${LINE_RICH_MENU_CANVAS.height}"><rect width="2500" height="1686" fill="${colors.canvas}"/><rect width="2500" height="300" fill="${colors.brand}"/>${actionRects}</svg>`;
}

export async function renderLineRichMenuImage(menu: LineRichMenuAssetManifestEntry): Promise<Buffer> {
  ensureShapingEngine();
  assertBundledLineRichMenuFont();
  const overlays: ImageOverlay[] = [];

  overlays.push(await createTextOverlay(
    "DEMI",
    { x: 100, y: 8, width: 2300, height: 58 },
    { fontSize: 50, weight: "Bold", color: colors.surface },
    { horizontal: 0, vertical: 2 },
    `${menu.key} brand label`,
  ));
  overlays.push(await createTextOverlay(
    menu.title,
    { x: 100, y: 70, width: 2300, height: 132 },
    { fontSize: 98, weight: "Semi-Bold", color: colors.surface },
    { horizontal: 16, vertical: 2 },
    `${menu.key} title`,
  ));
  overlays.push(await createTextOverlay(
    menu.context,
    { x: 100, y: 204, width: 2300, height: 86 },
    { fontSize: 58, weight: "Medium", color: colors.surface },
    { horizontal: 24, vertical: 2 },
    `${menu.key} context`,
  ));

  for (const [index, action] of menu.actions.entries()) {
    const primary = isPrimaryAction(menu, action, index);
    const fontSize = getActionFontSize(menu, action, index);
    const style: LineMenuTextStyle = {
      fontSize,
      weight: primary ? "Bold" : "Semi-Bold",
      color: primary ? colors.surface : colors.ink,
    };
    overlays.push(await createTextOverlay(
      getLineRichMenuActionLines(action.label, action.bounds.width, menu.key).join("\n"),
      action.bounds,
      style,
      { horizontal: 64, vertical: 24 },
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
