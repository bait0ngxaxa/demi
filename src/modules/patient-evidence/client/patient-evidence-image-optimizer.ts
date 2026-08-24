import {
  INITIAL_IMAGE_QUALITY,
  MAX_IMAGE_DIMENSION,
  NORMALIZED_UPLOAD_MAX_BYTES,
  PATIENT_EVIDENCE_MEDIA_TYPES,
  SOURCE_IMAGE_MAX_BYTES,
  type PatientEvidenceMediaType,
} from "../policies/patient-evidence-image-policy";

export type PatientEvidenceImageOptimizationErrorCode =
  | "EMPTY_SOURCE"
  | "SOURCE_TOO_LARGE"
  | "UNSUPPORTED_IMAGE"
  | "PROCESSING_FAILED"
  | "NORMALIZED_TOO_LARGE";

export class PatientEvidenceImageOptimizationError extends Error {
  readonly code: PatientEvidenceImageOptimizationErrorCode;

  constructor(code: PatientEvidenceImageOptimizationErrorCode) {
    super("Patient evidence image could not be optimized");
    this.name = "PatientEvidenceImageOptimizationError";
    this.code = code;
  }
}

export type EvidenceImageDimensions = {
  width: number;
  height: number;
};

type EvidenceImageSource = Pick<File, "size" | "type">;

type DecodedEvidenceImage = EvidenceImageDimensions & {
  source: CanvasImageSource;
  dispose: () => void;
};

const JPEG_OUTPUT_MEDIA_TYPE = "image/jpeg";

const OPTIMIZATION_ATTEMPTS = [
  { dimensionScale: 1, quality: INITIAL_IMAGE_QUALITY },
  { dimensionScale: 1, quality: 0.76 },
  { dimensionScale: 0.9, quality: 0.68 },
  { dimensionScale: 0.8, quality: 0.6 },
] as const;

function isSupportedMediaType(mediaType: string): mediaType is PatientEvidenceMediaType {
  return PATIENT_EVIDENCE_MEDIA_TYPES.includes(mediaType as PatientEvidenceMediaType);
}

export function validateEvidenceImageSource(file: EvidenceImageSource): void {
  if (file.size === 0) {
    throw new PatientEvidenceImageOptimizationError("EMPTY_SOURCE");
  }

  if (file.size > SOURCE_IMAGE_MAX_BYTES) {
    throw new PatientEvidenceImageOptimizationError("SOURCE_TOO_LARGE");
  }

  if (!isSupportedMediaType(file.type.toLowerCase())) {
    throw new PatientEvidenceImageOptimizationError("UNSUPPORTED_IMAGE");
  }
}

export function calculateNormalizedDimensions(
  width: number,
  height: number,
  maxDimension = MAX_IMAGE_DIMENSION,
): EvidenceImageDimensions {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxDimension) ||
    width <= 0 ||
    height <= 0 ||
    maxDimension <= 0
  ) {
    throw new PatientEvidenceImageOptimizationError("PROCESSING_FAILED");
  }

  const longestEdge = Math.max(width, height);

  if (longestEdge <= maxDimension) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxDimension / longestEdge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canonicalFileName(mediaType: PatientEvidenceMediaType): string {
  switch (mediaType) {
    case "image/jpeg":
      return "evidence.jpg";
    case "image/png":
      return "evidence.png";
    case "image/webp":
      return "evidence.webp";
  }
}

function copyForUpload(file: File): File {
  const mediaType = file.type.toLowerCase() as PatientEvidenceMediaType;

  return new File([file], canonicalFileName(mediaType), {
    lastModified: file.lastModified,
    type: mediaType,
  });
}

function loadHtmlImage(file: File): Promise<DecodedEvidenceImage> {
  if (
    typeof Image === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return Promise.reject(new PatientEvidenceImageOptimizationError("PROCESSING_FAILED"));
  }

  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        URL.revokeObjectURL(objectUrl);
        reject(new PatientEvidenceImageOptimizationError("PROCESSING_FAILED"));
        return;
      }

      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: () => URL.revokeObjectURL(objectUrl),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new PatientEvidenceImageOptimizationError("PROCESSING_FAILED"));
    };
    image.src = objectUrl;
  });
}

async function decodeEvidenceImage(file: File): Promise<DecodedEvidenceImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);

      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          dispose: () => bitmap.close(),
        };
      }

      bitmap.close();
    } catch {
      // Fall back to HTMLImageElement for browsers with partial createImageBitmap support.
    }
  }

  return loadHtmlImage(file);
}

function encodeJpeg(
  source: CanvasImageSource,
  dimensions: EvidenceImageDimensions,
  quality: number,
): Promise<Blob> {
  if (typeof document === "undefined") {
    return Promise.reject(new PatientEvidenceImageOptimizationError("PROCESSING_FAILED"));
  }

  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext("2d");

  if (!context) {
    return Promise.reject(new PatientEvidenceImageOptimizationError("PROCESSING_FAILED"));
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, dimensions.width, dimensions.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, dimensions.width, dimensions.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;

      if (!blob || blob.size === 0 || blob.type !== JPEG_OUTPUT_MEDIA_TYPE) {
        reject(new PatientEvidenceImageOptimizationError("PROCESSING_FAILED"));
        return;
      }

      resolve(blob);
    }, JPEG_OUTPUT_MEDIA_TYPE, quality);
  });
}

function scaleDimensions(
  dimensions: EvidenceImageDimensions,
  scale: number,
): EvidenceImageDimensions {
  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  };
}

export async function optimizeEvidenceImage(file: File): Promise<File> {
  validateEvidenceImageSource(file);

  let decoded: DecodedEvidenceImage;

  try {
    decoded = await decodeEvidenceImage(file);
  } catch (error: unknown) {
    if (error instanceof PatientEvidenceImageOptimizationError) {
      throw error;
    }

    throw new PatientEvidenceImageOptimizationError("PROCESSING_FAILED");
  }

  try {
    const targetDimensions = calculateNormalizedDimensions(decoded.width, decoded.height);
    const isWithinDimensionLimit =
      targetDimensions.width === decoded.width && targetDimensions.height === decoded.height;

    if (file.size <= NORMALIZED_UPLOAD_MAX_BYTES && isWithinDimensionLimit) {
      return copyForUpload(file);
    }

    for (const attempt of OPTIMIZATION_ATTEMPTS) {
      const blob = await encodeJpeg(
        decoded.source,
        scaleDimensions(targetDimensions, attempt.dimensionScale),
        attempt.quality,
      );

      if (blob.size <= NORMALIZED_UPLOAD_MAX_BYTES) {
        return new File([blob], "evidence.jpg", {
          lastModified: Date.now(),
          type: JPEG_OUTPUT_MEDIA_TYPE,
        });
      }
    }
  } catch (error: unknown) {
    if (error instanceof PatientEvidenceImageOptimizationError) {
      throw error;
    }

    throw new PatientEvidenceImageOptimizationError("PROCESSING_FAILED");
  } finally {
    decoded.dispose();
  }

  throw new PatientEvidenceImageOptimizationError("NORMALIZED_TOO_LARGE");
}

export function getEvidenceImageOptimizationErrorMessage(error: unknown): string {
  if (!(error instanceof PatientEvidenceImageOptimizationError)) {
    return "ไม่สามารถเตรียมรูปนี้สำหรับอัปโหลดได้ กรุณาเลือกรูปอื่น";
  }

  switch (error.code) {
    case "EMPTY_SOURCE":
      return "รูปที่เลือกเป็นไฟล์ว่าง กรุณาเลือกรูปอื่น";
    case "SOURCE_TOO_LARGE":
      return "รูปที่เลือกมีขนาดใหญ่เกิน 25 MB กรุณาเลือกรูปอื่น";
    case "UNSUPPORTED_IMAGE":
      return "ยังไม่รองรับรูปแบบไฟล์นี้ กรุณาเลือกไฟล์ JPEG, PNG หรือ WEBP";
    case "NORMALIZED_TOO_LARGE":
      return "ไม่สามารถลดขนาดรูปนี้ให้พร้อมอัปโหลดได้ กรุณาเลือกรูปอื่น";
    case "PROCESSING_FAILED":
      return "ไม่สามารถเตรียมรูปนี้สำหรับอัปโหลดได้ กรุณาเลือกรูปอื่น";
  }
}

export const patientEvidenceImageOptimizerInternals = {
  OPTIMIZATION_ATTEMPTS,
  scaleDimensions,
};
