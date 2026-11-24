// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createBrandedQrPngDataUrl } from "@/lib/qr/branded-qr-png.client";
import { createBrandedQrSvgDataUrl } from "@/lib/qr/branded-qr";

const url = "https://demi.example/recover#synthetic-token";

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
  it("rasterizes the branded SVG onto a white canvas of the requested size", async () => {
    const decode = vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");

    await expect(createBrandedQrPngDataUrl(url, { size: 720 })).resolves.toBe("data:image/png;base64,AAAA");

    expect(decode).toHaveBeenCalledOnce();
    const image = context.drawImage.mock.calls[0]?.[0] as HTMLImageElement;
    expect(image.src).toBe(createBrandedQrSvgDataUrl(url, { size: 720 }));
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 720, 720);
    expect(context.fillStyle).toBe("#fff");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 720, 720);
    expect(toDataURL).toHaveBeenCalledWith("image/png");
    const canvas = toDataURL.mock.contexts[0] as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([720, 720]);
  });

  it("fails instead of returning an empty image when the SVG cannot be decoded or drawn", async () => {
    vi.spyOn(HTMLImageElement.prototype, "decode").mockRejectedValueOnce(new Error("decode failed"));
    await expect(createBrandedQrPngDataUrl(url, { size: 720 })).rejects.toThrow("decode failed");

    vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(createBrandedQrPngDataUrl(url, { size: 720 })).rejects.toThrow("Canvas 2D context is unavailable");
    await expect(createBrandedQrPngDataUrl(url, { size: 0 })).rejects.toThrow();
  });
});
