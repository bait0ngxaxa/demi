import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_IMAGE_DIMENSION,
  NORMALIZED_UPLOAD_MAX_BYTES,
  SOURCE_IMAGE_MAX_BYTES,
} from "../policies/patient-evidence-image-policy";
import {
  calculateNormalizedDimensions,
  getEvidenceImageOptimizationErrorMessage,
  optimizeEvidenceImage,
  validateEvidenceImageSource,
  type PatientEvidenceImageOptimizationError,
} from "./patient-evidence-image-optimizer";

function source(size: number, type = "image/jpeg"): Pick<File, "size" | "type"> {
  return { size, type };
}

function captureError(run: () => void): PatientEvidenceImageOptimizationError {
  try {
    run();
  } catch (error: unknown) {
    return error as PatientEvidenceImageOptimizationError;
  }

  throw new Error("Expected source validation to fail");
}

describe("Patient Evidence source image validation", () => {
  it.each([
    [1, "image/jpeg"],
    [SOURCE_IMAGE_MAX_BYTES, "image/png"],
    [1024, "image/webp"],
  ])("accepts supported non-empty input up to 25 MiB", (size, type) => {
    expect(() => validateEvidenceImageSource(source(size, type))).not.toThrow();
  });

  it("rejects a source larger than 25 MiB with safe Thai guidance", () => {
    const error = captureError(() =>
      validateEvidenceImageSource(source(SOURCE_IMAGE_MAX_BYTES + 1)),
    );

    expect(error.code).toBe("SOURCE_TOO_LARGE");
    expect(getEvidenceImageOptimizationErrorMessage(error)).toBe(
      "รูปที่เลือกมีขนาดใหญ่เกิน 25 MB กรุณาเลือกรูปอื่น",
    );
  });

  it("rejects an empty source", () => {
    expect(captureError(() => validateEvidenceImageSource(source(0))).code).toBe("EMPTY_SOURCE");
  });

  it.each(["image/heic", "image/heif", "image/gif", "application/pdf", ""])(
    "rejects unsupported source media %s",
    (type) => {
      const error = captureError(() => validateEvidenceImageSource(source(1024, type)));

      expect(error.code).toBe("UNSUPPORTED_IMAGE");
      expect(getEvidenceImageOptimizationErrorMessage(error)).toContain("JPEG, PNG หรือ WEBP");
    },
  );
});

describe("Patient Evidence normalized dimensions", () => {
  it.each([
    [4000, 3000, 2560, 1920],
    [3000, 4000, 1920, 2560],
    [1920, 1080, 1920, 1080],
    [1000, 1000, 1000, 1000],
  ])("maps %d x %d to %d x %d without upscaling", (width, height, expectedWidth, expectedHeight) => {
    expect(calculateNormalizedDimensions(width, height)).toEqual({
      width: expectedWidth,
      height: expectedHeight,
    });
    expect(Math.max(expectedWidth, expectedHeight)).toBeLessThanOrEqual(MAX_IMAGE_DIMENSION);
  });
});

describe("Patient Evidence browser image optimization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps suitable bytes without exposing the original file name", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({
      close,
      height: 1080,
      width: 1920,
    }));
    const original = new File([new Uint8Array([0xff, 0xd8, 0xff])], "patient-name.jpg", {
      lastModified: 123,
      type: "image/jpeg",
    });

    const result = await optimizeEvidenceImage(original);

    expect(result.name).toBe("evidence.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(original.size);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("resizes a large landscape image to 2560 x 1920 and starts at quality 0.85", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
      callback(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type }));
      expect(quality).toBe(0.85);
    });
    const canvas = {
      height: 0,
      width: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage,
        fillRect: vi.fn(),
        fillStyle: "",
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
      }),
      toBlob,
    };
    const bitmap = { close, height: 3000, width: 4000 };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(canvas) });
    const original = new File([new Uint8Array([0xff, 0xd8, 0xff])], "large.jpg", {
      type: "image/jpeg",
    });

    const result = await optimizeEvidenceImage(original);

    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBeLessThanOrEqual(NORMALIZED_UPLOAD_MAX_BYTES);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2560, 1920);
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("fails clearly after the bounded attempts when output remains larger than 8 MiB", async () => {
    const close = vi.fn();
    const oversizedBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: "image/jpeg",
    });
    Object.defineProperty(oversizedBlob, "size", {
      value: NORMALIZED_UPLOAD_MAX_BYTES + 1,
    });
    const toBlob = vi.fn((callback: BlobCallback) => callback(oversizedBlob));
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({
      close,
      height: 3000,
      width: 4000,
    }));
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue({
        height: 0,
        width: 0,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          fillStyle: "",
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
        }),
        toBlob,
      }),
    });
    const original = new File([new Uint8Array([0xff, 0xd8, 0xff])], "large.jpg", {
      type: "image/jpeg",
    });

    await expect(optimizeEvidenceImage(original)).rejects.toMatchObject({
      code: "NORMALIZED_TOO_LARGE",
    });
    expect(toBlob).toHaveBeenCalledTimes(4);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
