export const SOURCE_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const NORMALIZED_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2560;
export const INITIAL_IMAGE_QUALITY = 0.85;

export const PATIENT_EVIDENCE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PatientEvidenceMediaType = (typeof PATIENT_EVIDENCE_MEDIA_TYPES)[number];

export const PATIENT_EVIDENCE_FILE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

