// @vitest-environment jsdom

import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createBrandedQrPngDataUrl } from "@/lib/qr/branded-qr-png.client";
import { computeBrandedQrLayout } from "@/lib/qr/branded-qr";
import { DEMI_QR_LOGO_PNG_BASE64 } from "@/lib/qr/demi-qr-logo";

const url = "https://demi.example/recover#synthetic-token";

type Rect = [number, number, number, number];

function stubCanvas(): { fills: { color: string; rect: Rect }[]; drawImage: ReturnType<typeof vi.fn> } {
  const fills: { color: string; rect: Rect }[] = [];
  const drawImage = vi.fn();
  const context = {
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    fillRect(this: { fillStyle: string }, ...rect: Rect) { fills.push({ color: this.fillStyle, rect }); },
    drawImage,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");
  return { fills, drawImage };
}

beforeAll(() => {
  // jsdom implements neither image decoding nor canvas; each test stubs the behaviour it needs.
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    writable: true,
    value: (): Promise<void> => Promise.reject(new Error("decode is not stubbed")),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBrandedQrPngDataUrl", () => {
  it("draws the modules on white and then the inlined logo PNG over the cleared centre, without any SVG", async () => {
    vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
    const { fills, drawImage } = stubCanvas();

    await expect(createBrandedQrPngDataUrl(url, { size: 720 })).resolves.toBe("data:image/png;base64,AAAA");

    expect(fills[0]).toEqual({ color: "#fff", rect: [0, 0, 720, 720] });
    const modules = fills.slice(1);
    expect(modules.length).toBeGreaterThan(0);
    expect(modules.every((fill) => fill.color === "#000" && fill.rect.every(Number.isInteger))).toBe(true);

    const logoImage = drawImage.mock.calls[0]?.[0] as HTMLImageElement;
    expect(drawImage).toHaveBeenCalledOnce();
    expect(logoImage.src).toBe(`data:image/png;base64,${DEMI_QR_LOGO_PNG_BASE64}`);
    const [, x, y, width, height] = drawImage.mock.calls[0] as [unknown, number, number, number, number];
    expect(x + width / 2).toBeCloseTo(360, -1);
    expect(y + height / 2).toBeCloseTo(360, -1);

    // No dark module is painted inside the cleared area around the logo.
    const moduleCount = QRCode.create(url, { errorCorrectionLevel: "Q" }).modules.size;
    const { excavation } = computeBrandedQrLayout(moduleCount);
    const scale = 720 / (moduleCount + 4);
    const clearedStart = (excavation.start + 2) * scale;
    const clearedEnd = (excavation.start + excavation.side + 2) * scale;
    for (const { rect: [left, top, w, h] } of modules) {
      const overlaps = left < clearedEnd - 1 && left + w > clearedStart + 1 && top < clearedEnd - 1 && top + h > clearedStart + 1;
      expect(overlaps).toBe(false);
    }
  });

  it.each([480, 720])("produces a %i px PNG that decodes back to the URL with the logo in place", async (size) => {
    vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
    // A pixel-writing stand-in for the 2D context, so the drawing itself is what gets decoded.
    const pixels = new Uint8Array(size * size * 3);
    let logoRect: Rect | null = null;
    const context = {
      fillStyle: "",
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillRect(this: { fillStyle: string }, left: number, top: number, width: number, height: number) {
        const value = this.fillStyle === "#000" ? 0 : 255;
        for (let y = top; y < top + height; y += 1) pixels.fill(value, (y * size + left) * 3, (y * size + left + width) * 3);
      },
      drawImage(_image: unknown, ...rect: Rect) { logoRect = rect; },
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,");
    const longUrl = `https://demi-health-network.hospital.example.go.th/app/family/invitations#${"K".repeat(43)}`;

    await createBrandedQrPngDataUrl(longUrl, { size });

    const [left, top, width, height] = logoRect ?? [0, 0, 0, 0];
    const logo = await sharp(Buffer.from(DEMI_QR_LOGO_PNG_BASE64, "base64")).resize(width, height).png().toBuffer();
    const { data, info } = await sharp(Buffer.from(pixels), { raw: { width: size, height: size, channels: 3 } })
      .composite([{ input: logo, left, top }])
      .flatten({ background: "#ffffff" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height)?.data).toBe(longUrl);
  });

  it("fails instead of returning an image without the logo or an empty image", async () => {
    vi.spyOn(HTMLImageElement.prototype, "decode").mockRejectedValueOnce(new Error("decode failed"));
    await expect(createBrandedQrPngDataUrl(url, { size: 720 })).rejects.toThrow("decode failed");

    vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(createBrandedQrPngDataUrl(url, { size: 720 })).rejects.toThrow("Canvas 2D context is unavailable");
    await expect(createBrandedQrPngDataUrl(url, { size: 0 })).rejects.toThrow();
  });
});
