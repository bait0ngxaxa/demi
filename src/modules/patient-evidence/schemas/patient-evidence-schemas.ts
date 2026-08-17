import { createHash } from "node:crypto";

import { z } from "zod";

import { ValidationError } from "@/shared/errors/application-error";

export const PATIENT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const PATIENT_EVIDENCE_CAPTION_MAX_LENGTH = 500;
export const PATIENT_EVIDENCE_LIST_LIMIT = 50;
export const PATIENT_EVIDENCE_SIGNED_URL_EXPIRY_SECONDS = 300;

export const PATIENT_EVIDENCE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PatientEvidenceMediaType = (typeof PATIENT_EVIDENCE_MEDIA_TYPES)[number];

export type PatientEvidenceValidationReason =
  | "INVALID_REQUEST"
  | "CAPTION_TOO_LONG"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_FILE_CONTENT"
  | "MEDIA_TYPE_MISMATCH";

export class PatientEvidenceInputError extends ValidationError {
  readonly reason: PatientEvidenceValidationReason;

  constructor(reason: PatientEvidenceValidationReason) {
    super("Patient evidence input is invalid");
    this.name = "PatientEvidenceInputError";
    this.reason = reason;
  }
}

const captionSchema = z
  .string()
  .max(PATIENT_EVIDENCE_CAPTION_MAX_LENGTH)
  .transform((value) => value.trim() || null);

export const patientEvidenceCreateInputSchema = z
  .object({
    relationshipId: z.string().uuid(),
    declaredMediaType: z.string().trim().min(1),
    bytes: z.instanceof(Uint8Array),
    caption: captionSchema.nullable().optional(),
  })
  .strict();

export type PatientEvidenceCreateInput = z.input<typeof patientEvidenceCreateInputSchema>;
export type NormalizedPatientEvidenceCreateInput = z.output<
  typeof patientEvidenceCreateInputSchema
> & {
  caption: string | null;
};

export const patientEvidenceRelationshipIdSchema = z.string().uuid();
export const patientEvidenceArtifactIdSchema = z.string().uuid();

function getInputErrorReason(error: z.ZodError): PatientEvidenceValidationReason {
  if (error.issues.some((issue) => issue.path[0] === "caption" && issue.code === "too_big")) {
    return "CAPTION_TOO_LONG";
  }

  return "INVALID_REQUEST";
}

export function normalizePatientEvidenceCreateInput(
  input: unknown,
): NormalizedPatientEvidenceCreateInput {
  const parsed = patientEvidenceCreateInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new PatientEvidenceInputError(getInputErrorReason(parsed.error));
  }

  return {
    ...parsed.data,
    caption: parsed.data.caption ?? null,
  };
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

export function detectPatientEvidenceMediaType(bytes: Uint8Array): PatientEvidenceMediaType | null {
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) && hasPrefix(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }

  return null;
}

export type ValidatedPatientEvidenceFile = {
  bytes: Uint8Array;
  mediaType: PatientEvidenceMediaType;
  byteSize: number;
  contentSha256: string;
};

export function validatePatientEvidenceFile(input: {
  bytes: Uint8Array;
  declaredMediaType: string;
}): ValidatedPatientEvidenceFile {
  const { bytes, declaredMediaType } = input;

  if (bytes.byteLength === 0) {
    throw new PatientEvidenceInputError("EMPTY_FILE");
  }

  if (bytes.byteLength > PATIENT_EVIDENCE_MAX_BYTES) {
    throw new PatientEvidenceInputError("FILE_TOO_LARGE");
  }

  if (!PATIENT_EVIDENCE_MEDIA_TYPES.includes(declaredMediaType as PatientEvidenceMediaType)) {
    throw new PatientEvidenceInputError("UNSUPPORTED_MEDIA_TYPE");
  }

  const detectedMediaType = detectPatientEvidenceMediaType(bytes);

  if (!detectedMediaType) {
    throw new PatientEvidenceInputError("INVALID_FILE_CONTENT");
  }

  if (detectedMediaType !== declaredMediaType) {
    throw new PatientEvidenceInputError("MEDIA_TYPE_MISMATCH");
  }

  return {
    bytes,
    mediaType: detectedMediaType,
    byteSize: bytes.byteLength,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export const patientEvidenceSchemaInternals = {
  captionSchema,
  detectPatientEvidenceMediaType,
  getInputErrorReason,
  hasPrefix,
};
