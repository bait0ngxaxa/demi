import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { createLineRichMenuAssetManifest } from "./line-rich-menu-asset-manifest";
import { assertBundledLineRichMenuFont } from "./line-rich-menu-font";
import {
  getLineRichMenuActionLines,
  getLineRichMenuColors,
  renderThaiTextBuffer,
} from "./line-rich-menu-renderer";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_DIRECTORY = "docs/line/rich-menu-previews";
const DEFAULT_INPUT_DIRECTORY = "public/line/rich-menus";
const CONTACT_WIDTHS = [360, 390, 430] as const;
const CONTACT_COLUMNS = 3;
const CONTACT_GUTTER = 14;
const CONTACT_LABEL_HEIGHT = 24;
type ImageOverlay = { input: Buffer; left: number; top: number };

function parseArguments(args: readonly string[]): { outputDirectory: string; inputDirectory: string } {
  const outputIndex = args.indexOf("--output");
  const inputIndex = args.indexOf("--input");
  const outputDirectory = outputIndex === -1 ? DEFAULT_OUTPUT_DIRECTORY : args[outputIndex + 1];
  const inputDirectory = inputIndex === -1 ? DEFAULT_INPUT_DIRECTORY : args[inputIndex + 1];
  if (!outputDirectory) throw new Error("--output requires a directory path.");
  if (!inputDirectory) throw new Error("--input requires a directory path.");
  return { outputDirectory, inputDirectory };
}

function svgLabel(text: string, width: number, height: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="2" y="17" font-family="Arial" font-size="14" font-weight="700" fill="#102620">${text}</text></svg>`,
  );
}

async function writeContactSheet(inputDirectory: string, outputDirectory: string, width: number): Promise<void> {
  const manifest = createLineRichMenuAssetManifest();
  const imageHeight = Math.round(width * 1686 / 2500);
  const tileHeight = CONTACT_LABEL_HEIGHT + imageHeight;
  const rows = Math.ceil(manifest.length / CONTACT_COLUMNS);
  const composites: ImageOverlay[] = [];

  for (const [index, menu] of manifest.entries()) {
    const x = CONTACT_GUTTER + (index % CONTACT_COLUMNS) * (width + CONTACT_GUTTER);
    const y = CONTACT_GUTTER + Math.floor(index / CONTACT_COLUMNS) * (tileHeight + CONTACT_GUTTER);
    const input = await readFile(resolve(inputDirectory, menu.assetFile));
    const preview = await sharp(input)
      .resize({ width, kernel: "lanczos3" })
      .png()
      .toBuffer();
    const previewMetadata = await sharp(preview).metadata();
    if (previewMetadata.width !== width || previewMetadata.height !== imageHeight) {
      throw new Error(`${menu.assetFile} did not resize to the expected ${width}px mobile preview.`);
    }
    composites.push({ input: svgLabel(menu.key, width, CONTACT_LABEL_HEIGHT), left: x, top: y });
    composites.push({ input: preview, left: x, top: y + CONTACT_LABEL_HEIGHT });
  }

  const sheetWidth = CONTACT_COLUMNS * width + (CONTACT_COLUMNS + 1) * CONTACT_GUTTER;
  const sheetHeight = rows * tileHeight + (rows + 1) * CONTACT_GUTTER;
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 3,
      background: "#EEF2F0",
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(outputDirectory, `rich-menu-contact-${width}.png`));
}

async function writeThaiGlyphProof(outputDirectory: string): Promise<void> {
  const samples = [
    "เชื่อมบัญชี DEMI",
    "ตรวจสอบนัดหมาย",
    "นัดหมายทั้งหมด",
    "บันทึกสุขภาพ",
    "ยาของฉัน",
    "ข้อมูลการดูแล",
    "ผู้ป่วยที่ดูแล",
    "คัดกรองผู้ป่วย",
    "บันทึกติดตาม",
    "เพิ่มผู้ป่วย",
    "เพิ่มเติม",
    "งานทั้งหมด",
    "จัดการบัญชี",
    "เลือกเมนูที่ต้องการใช้",
  ];
  const proofWidth = 1800;
  const headerHeight = 80;
  const rowHeight = 440;
  const proofHeight = headerHeight + samples.length * rowHeight;
  const colors = getLineRichMenuColors();
  const composites: ImageOverlay[] = [];

  for (const [index, label] of samples.entries()) {
    const lines = label === "เลือกเมนูที่ต้องการใช้"
      ? [label]
      : getLineRichMenuActionLines(label);
    const image = await renderThaiTextBuffer(lines.join("\n"), {
      fontSize: 140,
      weight: "Bold",
      color: colors.brand,
    });
    const metadata = await sharp(image).metadata();
    if (metadata.width === undefined || metadata.height === undefined ||
      metadata.width > proofWidth - 120 || metadata.height > rowHeight - 36) {
      throw new Error(
        `Thai glyph proof text ${label} measures ${metadata.width}×${metadata.height}px; row text area is ${proofWidth - 120}×${rowHeight - 36}px.`,
      );
    }
    composites.push({
      input: image,
      left: Math.round((proofWidth - metadata.width) / 2),
      top: headerHeight + index * rowHeight + Math.round((rowHeight - metadata.height) / 2),
    });
  }

  const rowSvg = samples.map((_, index) => {
    const y = headerHeight + index * rowHeight;
    const fill = index % 2 === 0 ? colors.surface : colors.soft;
    return `<rect x="0" y="${y}" width="${proofWidth}" height="${rowHeight}" fill="${fill}"/><path d="M0 ${y}H${proofWidth}" stroke="${colors.line}" stroke-width="2"/>`;
  }).join("");
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${proofWidth}" height="${proofHeight}"><rect width="100%" height="100%" fill="${colors.canvas}"/><rect width="${proofWidth}" height="${headerHeight}" fill="${colors.brand}"/><text x="40" y="52" font-family="Arial" font-size="30" font-weight="700" fill="#FFFFFF">DEMI · THAI GLYPH SAMPLES</text>${rowSvg}</svg>`,
  );

  await sharp(background)
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(outputDirectory, "thai-glyph-samples.png"));
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const outputDirectory = resolve(REPOSITORY_ROOT, options.outputDirectory);
  const inputDirectory = resolve(REPOSITORY_ROOT, options.inputDirectory);
  const manifest = createLineRichMenuAssetManifest();
  if (manifest.length !== 18) throw new Error(`Expected 18 menu variants; found ${manifest.length}.`);
  assertBundledLineRichMenuFont();
  if (!sharp.versions.pango || !sharp.versions.harfbuzz) {
    throw new Error("Rich Menu previews require Sharp with Pango and HarfBuzz support.");
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const width of CONTACT_WIDTHS) await writeContactSheet(inputDirectory, outputDirectory, width);
  await writeThaiGlyphProof(outputDirectory);
  process.stdout.write(`Generated 18-menu contact sheets at 360px, 390px, and 430px plus Thai glyph samples in ${outputDirectory}.\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Rich Menu preview generation failed: ${message}\n`);
  process.exitCode = 1;
});
