import sharp from "sharp";

import { assertBundledLineRichMenuFont } from "./line-rich-menu-font";
import {
  getLineRichMenuIllustrationBuffer,
  type LineRichMenuIllustration,
  type LineRichMenuIllustrationTone,
} from "./line-rich-menu-illustrations";
import type { LineMenuBounds } from "../src/modules/line/rich-menu/layout";

export const LINE_RICH_MENU_CANVAS = { width: 2500, height: 1686 } as const;

const colors = {
  canvas: "#F3F7F5",
  ink: "#102620",
  brand: "#0E3C35",
  brandSoft: "#DCEEE9",
  surface: "#FFFFFF",
  patientPrimary: "#F5E8E1",
  patientSecondary: "#FBF5F1",
  osmPrimary: "#DCEEE9",
  osmSecondary: "#EFF5F2",
  hospitalPrimary: "#E1EDF1",
  hospitalSecondary: "#F2F6F7",
  accountPrimary: "#F2E8D0",
  accountSecondary: "#F8F4E9",
  headerContext: "#DCEEE9",
} as const;

const toneColors: Record<LineRichMenuIllustrationTone, { primary: string; secondary: string }> = {
  patient: { primary: colors.patientPrimary, secondary: colors.patientSecondary },
  osm: { primary: colors.osmPrimary, secondary: colors.osmSecondary },
  hospital: { primary: colors.hospitalPrimary, secondary: colors.hospitalSecondary },
  account: { primary: colors.accountPrimary, secondary: colors.accountSecondary },
};

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
  illustration: LineRichMenuIllustration;
  tone: LineRichMenuIllustrationTone;
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
  return action.bounds.width < 500 ? 88 : action.bounds.width < 800 ? 112 : 144;
}

function getIllustrationSize(bounds: LineMenuBounds): number {
  return Math.round(Math.min(bounds.width * 0.76, bounds.height * 0.43));
}

export function getLineRichMenuActionLines(label: string): readonly string[] {
  return thaiLabelLines[label] ?? [label];
}

function buildBaseSvg(menu: LineRichMenuAssetManifestEntry): string {
  const areas = menu.actions.map((action, index) => {
    const background = toneColors[action.tone][isPrimaryAction(menu, action, index) ? "primary" : "secondary"];
    const { x, y, width, height } = action.bounds;
    // The flat rectangular field aligns with LINE's tappable area; gutters remain visible between actions.
    return `<rect x="${x + 1}" y="${y + 1}" width="${width - 2}" height="${height - 2}" fill="${background}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LINE_RICH_MENU_CANVAS.width}" height="${LINE_RICH_MENU_CANVAS.height}" viewBox="0 0 2500 1686"><rect width="2500" height="1686" fill="${colors.canvas}"/><rect width="2500" height="204" fill="${colors.brand}"/>${areas}</svg>`;
}

export async function renderLineRichMenuImage(menu: LineRichMenuAssetManifestEntry): Promise<Buffer> {
  ensureShapingEngine();
  assertBundledLineRichMenuFont();
  const illustrationOverlays: ImageOverlay[] = [];
  const textOverlays: ImageOverlay[] = [];

  for (const action of menu.actions) {
    const illustrationSize = getIllustrationSize(action.bounds);
    const illustration = await getLineRichMenuIllustrationBuffer(action.illustration);
    const image = await sharp(illustration)
      .resize(illustrationSize, illustrationSize, {
        fit: "contain",
        kernel: "lanczos3",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    illustrationOverlays.push({
      input: image,
      left: Math.round(action.bounds.x + (action.bounds.width - illustrationSize) / 2),
      top: action.bounds.y + Math.round(action.bounds.height * 0.025),
    });
  }

  textOverlays.push(await createTextOverlay(
    "DEMI",
    { x: 64, y: 22, width: 320, height: 110 },
    { fontSize: 86, weight: "Bold", color: colors.surface },
    { horizontal: 0, vertical: 2 },
    `${menu.key} brand label`,
  ));
  textOverlays.push(await createTextOverlay(
    menu.title,
    { x: 440, y: 0, width: 1620, height: 120 },
    { fontSize: 86, weight: "Semi-Bold", color: colors.surface },
    { horizontal: 16, vertical: 2 },
    `${menu.key} title`,
  ));
  textOverlays.push(await createTextOverlay(
    menu.context,
    { x: 440, y: 114, width: 1620, height: 80 },
    { fontSize: 56, weight: "Medium", color: colors.headerContext },
    { horizontal: 24, vertical: 2 },
    `${menu.key} context`,
  ));

  for (const action of menu.actions) {
    const fontSize = getActionFontSize(action);
    textOverlays.push(await createTextOverlay(
      getLineRichMenuActionLines(action.label).join("\n"),
      {
        x: action.bounds.x,
        y: action.bounds.y + Math.round(action.bounds.height * 0.45),
        width: action.bounds.width,
        height: Math.floor(action.bounds.height * 0.53),
      },
      { fontSize, weight: "Semi-Bold", color: colors.ink },
      { horizontal: 24, vertical: 4 },
      `${menu.key} action “${action.label}”`,
    ));
  }

  return sharp(Buffer.from(buildBaseSvg(menu)))
    .composite([...illustrationOverlays, ...textOverlays])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

export function getLineRichMenuColors(): Readonly<typeof colors> {
  return colors;
}
