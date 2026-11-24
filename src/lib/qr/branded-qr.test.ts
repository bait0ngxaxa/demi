import { createHash } from "node:crypto";

import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplicationCredentialUrlBuilder, type ApplicationCredentialPath } from "@/lib/env/server";
import {
  BRANDED_QR_ERROR_CORRECTION_LEVEL,
  computeBrandedQrLayout,
  createBrandedQrSvg,
  createBrandedQrSvgDataUrl,
} from "@/lib/qr/branded-qr";
import { DEMI_QR_LOGO_PNG_BASE64 } from "@/lib/qr/demi-qr-logo";

// The same shape as a real credential token: 32 random bytes as base64url, 43 characters.
const token = createHash("sha256").update("branded-qr-test-token").digest("base64url");
const activationUrl = `https://demi.example/activate/workforce#${token}`;
// A long but realistic public origin, so the encoded URLs are at the dense end of what production makes.
const longOrigin = "https://demi-health-network.hospital.example.go.th";
const credentialPaths: ApplicationCredentialPath[] = [
  "/activate/workforce",
  "/activate/patient",
  "/recover",
  "/app/family/invitations",
];

type Rect = { x: number; y: number; width: number; height: number };

function parseRect(tag: string): Rect {
  const read = (name: string): number => Number(new RegExp(`\\s${name}="(-?[\\d.]+)"`).exec(tag)?.[1]);
  return { x: read("x"), y: read("y"), width: read("width"), height: read("height") };
}

function darkModules(svg: string): Set<string> {
  const d = /<path fill="#000" d="([^"]*)"/.exec(svg)?.[1] ?? "";
  const cells = new Set<string>();
  for (const [, x, y, length] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let offset = 0; offset < Number(length); offset += 1) cells.add(`${Number(x) + offset},${y}`);
  }
  return cells;
}

async function decode(svg: string): Promise<string | null> {
  const { data, info } = await sharp(Buffer.from(svg))
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height)?.data ?? null;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createBrandedQrSvg", () => {
  it("inlines exactly one PNG logo and references nothing else", () => {
    const svg = createBrandedQrSvg(activationUrl);

    expect(svg.match(/<image\b/g)).toHaveLength(1);
    expect(svg.match(/\bhref="/g)).toHaveLength(1);
    expect(svg).toContain(`href="data:image/png;base64,${DEMI_QR_LOGO_PNG_BASE64}"`);
    expect(svg).not.toMatch(/\bsrc=|xlink:|<script|<foreignObject|url\(|https?:\/\/(?!www\.w3\.org\/2000\/svg")/);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('role="img"');
  });

  it("encodes at level Q", () => {
    const createSpy = vi.spyOn(QRCode, "create");

    createBrandedQrSvg(activationUrl);

    expect(BRANDED_QR_ERROR_CORRECTION_LEVEL).toBe("Q");
    expect(createSpy).toHaveBeenCalledWith(activationUrl, { errorCorrectionLevel: "Q" });
    createSpy.mockRestore();
  });

  it("centres the logo, keeps it clear of the finder patterns and draws no dark module under it", () => {
    const svg = createBrandedQrSvg(activationUrl);
    const moduleCount = QRCode.create(activationUrl, { errorCorrectionLevel: "Q" }).modules.size;
    const { logo, excavation } = computeBrandedQrLayout(moduleCount);
    const image = parseRect(/<image\b[^>]*>/.exec(svg)?.[0] ?? "");

    expect(image).toEqual({ x: logo.start, y: logo.start, width: logo.side, height: logo.side });
    expect(logo.start * 2 + logo.side).toBe(moduleCount);
    expect(logo.side / moduleCount).toBeCloseTo(0.22, 1);
    expect(excavation).toEqual({ start: logo.start - 1, side: logo.side + 2 });
    for (const finder of [{ x: 0, y: 0 }, { x: moduleCount - 7, y: 0 }, { x: 0, y: moduleCount - 7 }]) {
      const apart = excavation.start >= finder.x + 7 || finder.x >= excavation.start + excavation.side ||
        excavation.start >= finder.y + 7 || finder.y >= excavation.start + excavation.side;
      expect(apart).toBe(true);
    }

    const drawn = darkModules(svg);
    expect(drawn.size).toBeGreaterThan(0);
    for (let row = excavation.start; row < excavation.start + excavation.side; row += 1) {
      for (let column = excavation.start; column < excavation.start + excavation.side; column += 1) {
        expect(drawn.has(`${column},${row}`)).toBe(false);
      }
    }
  });

  it("refuses a layout whose cleared area would reach a finder pattern", () => {
    expect(() => computeBrandedQrLayout(13)).toThrow("finder pattern");
  });

  it("sizes the quiet zone from the margin option", () => {
    const moduleCount = QRCode.create(activationUrl, { errorCorrectionLevel: "Q" }).modules.size;

    expect(createBrandedQrSvg(activationUrl)).toContain(`viewBox="-2 -2 ${moduleCount + 4} ${moduleCount + 4}"`);
    expect(createBrandedQrSvg(activationUrl, { margin: 1 })).toContain(`viewBox="-1 -1 ${moduleCount + 2} ${moduleCount + 2}"`);
    expect(createBrandedQrSvg(activationUrl, { margin: 4, size: 300 })).toMatch(
      new RegExp(`width="300" height="300" viewBox="-4 -4 ${moduleCount + 8} ${moduleCount + 8}"`),
    );
    expect(() => createBrandedQrSvg(activationUrl, { margin: -1 })).toThrow();
    expect(() => createBrandedQrSvg(activationUrl, { margin: 1.5 })).toThrow();
  });

  it("returns the same SVG as a base64 data URL", () => {
    const dataUrl = createBrandedQrSvgDataUrl(activationUrl);
    const prefix = "data:image/svg+xml;base64,";

    expect(dataUrl.startsWith(prefix)).toBe(true);
    expect(Buffer.from(dataUrl.slice(prefix.length), "base64").toString("ascii")).toBe(createBrandedQrSvg(activationUrl));
  });
});

describe("branded QR decoding", () => {
  it("renders the logo in the rasterized code", async () => {
    const { data, info } = await sharp(Buffer.from(createBrandedQrSvg(activationUrl, { size: 240 })))
      .flatten({ background: "#ffffff" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centre = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    const [red, green, blue] = [data[centre], data[centre + 1], data[centre + 2]];

    // The middle of the logo is coloured artwork, not a white gap or a black module.
    expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeGreaterThan(40);
  });

  const realUrls = (): string[] => {
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", longOrigin);
    return credentialPaths.map((path) => createApplicationCredentialUrlBuilder(path).build(token));
  };

  // 192 px is the smallest box a QR is shown in (the patient activation handoff: h-52 minus p-2); phones
  // render it at 2-3 device pixels per CSS pixel, and printed slips at printer resolution. Below ~170 px the
  // symbol has under 3 px per module and jsQR misses some codes at level Q and H alike, with or without the logo.
  it.each([192, 240])("decodes every real credential URL shape at %i px", async (size) => {
    const urls = [activationUrl, ...realUrls()];
    expect(Math.max(...urls.map((url) => url.length))).toBeGreaterThanOrEqual(96);

    for (const url of urls) {
      for (const margin of [1, 2, 4]) {
        await expect(decode(createBrandedQrSvg(url, { margin, size }))).resolves.toBe(url);
      }
    }
  });
});
