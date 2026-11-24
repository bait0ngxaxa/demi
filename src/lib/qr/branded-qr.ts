import QRCode from "qrcode";

import { DEMI_QR_LOGO_PNG_BASE64 } from "@/lib/qr/demi-qr-logo";

/**
 * Builds DEMI QR codes with the DEMI logo in the centre. Isomorphic: no DOM, no canvas.
 *
 * Level Q (~25% recovery) leaves a wide margin for a logo that covers ~5% of the symbol while staying
 * less dense than level H, which decodes worse when the code is shown small.
 */
export const BRANDED_QR_ERROR_CORRECTION_LEVEL = "Q" as const;

/** Logo side as a share of the symbol width (~5% of its area). */
const LOGO_WIDTH_RATIO = 0.22;
/** Modules cleared around the logo so dark modules never touch the artwork. */
const LOGO_CLEARANCE_MODULES = 1;
const FINDER_PATTERN_MODULES = 7;
const DEFAULT_MARGIN_MODULES = 2;
const DEFAULT_SIZE_PX = 240;

export type BrandedQrOptions = {
  /** Quiet zone in modules on every side. Defaults to 2. */
  margin?: number;
  /** Intrinsic width and height of the SVG in CSS pixels. Defaults to 240. */
  size?: number;
};

/** A square in module coordinates: columns/rows [start, start + side). */
export type QrModuleBox = { start: number; side: number };

export type BrandedQrLayout = {
  moduleCount: number;
  logo: QrModuleBox;
  excavation: QrModuleBox;
};

/** The encoded symbol with the logo area already cleared; shared by the SVG and the canvas PNG. */
export type BrandedQrSymbol = {
  layout: BrandedQrLayout;
  isDark: (row: number, column: number) => boolean;
};

function boxesIntersect(a: { row: number; column: number; side: number }, b: { row: number; column: number; side: number }): boolean {
  return a.row < b.row + b.side && b.row < a.row + a.side && a.column < b.column + b.side && b.column < a.column + a.side;
}

/** Centres the logo on the module grid and checks it stays clear of the three finder patterns. */
export function computeBrandedQrLayout(moduleCount: number): BrandedQrLayout {
  let logoSide = Math.round(moduleCount * LOGO_WIDTH_RATIO);
  // Same parity as the symbol, so the logo starts on a whole module and sits exactly in the centre.
  if ((moduleCount - logoSide) % 2 !== 0) logoSide -= 1;
  const logoStart = (moduleCount - logoSide) / 2;
  const excavation = {
    start: logoStart - LOGO_CLEARANCE_MODULES,
    side: logoSide + LOGO_CLEARANCE_MODULES * 2,
  };

  const far = moduleCount - FINDER_PATTERN_MODULES;
  const finders = [
    { row: 0, column: 0, side: FINDER_PATTERN_MODULES },
    { row: 0, column: far, side: FINDER_PATTERN_MODULES },
    { row: far, column: 0, side: FINDER_PATTERN_MODULES },
  ];
  const cleared = { row: excavation.start, column: excavation.start, side: excavation.side };
  if (logoSide <= 0 || finders.some((finder) => boxesIntersect(cleared, finder))) {
    throw new Error("The QR logo area would overlap a finder pattern");
  }

  return { moduleCount, logo: { start: logoStart, side: logoSide }, excavation };
}

function insideBox(index: number, box: QrModuleBox): boolean {
  return index >= box.start && index < box.start + box.side;
}

export function createBrandedQrSymbol(text: string): BrandedQrSymbol {
  const qr = QRCode.create(text, { errorCorrectionLevel: BRANDED_QR_ERROR_CORRECTION_LEVEL });
  const layout = computeBrandedQrLayout(qr.modules.size);
  return {
    layout,
    isDark: (row, column) =>
      qr.modules.get(row, column) === 1 && !(insideBox(row, layout.excavation) && insideBox(column, layout.excavation)),
  };
}

/** One path for all dark modules, drawn as horizontal runs per row. */
function darkModulesPath(symbol: BrandedQrSymbol): string {
  const { moduleCount } = symbol.layout;
  const commands: string[] = [];
  for (let row = 0; row < moduleCount; row += 1) {
    let column = 0;
    while (column < moduleCount) {
      if (!symbol.isDark(row, column)) {
        column += 1;
        continue;
      }
      const runStart = column;
      while (column < moduleCount && symbol.isDark(row, column)) column += 1;
      const runLength = column - runStart;
      commands.push(`M${runStart} ${row}h${runLength}v1h-${runLength}z`);
    }
  }
  return commands.join("");
}

export function readBrandedQrMargin(options: BrandedQrOptions | undefined): number {
  const margin = options?.margin ?? DEFAULT_MARGIN_MODULES;
  if (!Number.isInteger(margin) || margin < 0) throw new Error("QR margin must be a non-negative integer");
  return margin;
}

function readSize(options: BrandedQrOptions | undefined): number {
  const size = options?.size ?? DEFAULT_SIZE_PX;
  if (!Number.isFinite(size) || size <= 0) throw new Error("QR size must be a positive number");
  return size;
}

/**
 * Returns a self-contained SVG: no scripts and no external references, the logo is inlined.
 * The logo uses `xlink:href` only: every current browser and older WebKit webviews read it, while adding
 * SVG2 `href` as well would embed the logo bytes twice.
 */
export function createBrandedQrSvg(text: string, options?: BrandedQrOptions): string {
  const margin = readBrandedQrMargin(options);
  const size = readSize(options);
  const symbol = createBrandedQrSymbol(text);
  const { moduleCount, logo, excavation } = symbol.layout;
  const viewSide = moduleCount + margin * 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" width="${size}" height="${size}" viewBox="${-margin} ${-margin} ${viewSide} ${viewSide}" shape-rendering="crispEdges">`,
    `<rect x="${-margin}" y="${-margin}" width="${viewSide}" height="${viewSide}" fill="#fff"/>`,
    `<path fill="#000" d="${darkModulesPath(symbol)}"/>`,
    `<rect x="${excavation.start}" y="${excavation.start}" width="${excavation.side}" height="${excavation.side}" rx="1" fill="#fff" shape-rendering="geometricPrecision"/>`,
    `<image x="${logo.start}" y="${logo.start}" width="${logo.side}" height="${logo.side}" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${DEMI_QR_LOGO_PNG_BASE64}"/>`,
    `</svg>`,
  ].join("");
}

function encodeAsciiBase64(value: string): string {
  // The SVG is ASCII only; refuse anything else instead of producing a broken data URL.
  if (!/^[\x20-\x7e]*$/.test(value)) throw new Error("Branded QR SVG must be ASCII");
  return typeof Buffer === "undefined" ? btoa(value) : Buffer.from(value, "ascii").toString("base64");
}

export function createBrandedQrSvgDataUrl(text: string, options?: BrandedQrOptions): string {
  return `data:image/svg+xml;base64,${encodeAsciiBase64(createBrandedQrSvg(text, options))}`;
}
