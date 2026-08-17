import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  normalizePatientEvidenceCreateInput,
  PATIENT_EVIDENCE_MAX_BYTES,
  validatePatientEvidenceFile,
  PatientEvidenceInputError,
} from "./patient-evidence-schemas";

const relationshipId = "11111111-1111-4111-8111-111111111111";

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
}

function webpBytes(): Uint8Array {
  return new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    0x00,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
  ]);
}

describe("Patient Evidence file validation", () => {
  it.each([
    ["image/jpeg", jpegBytes()],
    ["image/png", pngBytes()],
    ["image/webp", webpBytes()],
  ])("accepts %s when the signature agrees", (mediaType, bytes) => {
    expect(validatePatientEvidenceFile({ bytes, declaredMediaType: mediaType })).toMatchObject({
      bytes,
      mediaType,
      byteSize: bytes.byteLength,
    });
  });

  it.each([
    ["image/gif", new Uint8Array([0x47, 0x49, 0x46, 0x38])],
    ["application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46])],
    ["image/svg+xml", new TextEncoder().encode("<svg></svg>")],
  ])("rejects unsupported media %s", (mediaType, bytes) => {
    expect(() => validatePatientEvidenceFile({ bytes, declaredMediaType: mediaType })).toThrowError(
      expect.objectContaining({ reason: "UNSUPPORTED_MEDIA_TYPE" }),
    );
  });

  it("rejects an empty file", () => {
    expect(() =>
      validatePatientEvidenceFile({ bytes: new Uint8Array(), declaredMediaType: "image/png" }),
    ).toThrowError(expect.objectContaining({ reason: "EMPTY_FILE" }));
  });

  it("rejects a file larger than 5 MiB", () => {
    expect(() =>
      validatePatientEvidenceFile({
        bytes: new Uint8Array(PATIENT_EVIDENCE_MAX_BYTES + 1),
        declaredMediaType: "image/png",
      }),
    ).toThrowError(expect.objectContaining({ reason: "FILE_TOO_LARGE" }));
  });

  it("rejects a declared media mismatch", () => {
    expect(() =>
      validatePatientEvidenceFile({ bytes: pngBytes(), declaredMediaType: "image/jpeg" }),
    ).toThrowError(expect.objectContaining({ reason: "MEDIA_TYPE_MISMATCH" }));
  });

  it("computes SHA-256 from the uploaded bytes", () => {
    const bytes = jpegBytes();
    const expected = createHash("sha256").update(bytes).digest("hex");

    expect(validatePatientEvidenceFile({ bytes, declaredMediaType: "image/jpeg" }).contentSha256).toBe(
      expected,
    );
    expect(validatePatientEvidenceFile({ bytes, declaredMediaType: "image/jpeg" }).contentSha256).toBe(
      expected,
    );
  });
});

describe("Patient Evidence input normalization", () => {
  it("trims captions and converts whitespace-only captions to null", () => {
    expect(
      normalizePatientEvidenceCreateInput({
        relationshipId,
        declaredMediaType: "image/jpeg",
        bytes: jpegBytes(),
        caption: "  จุดสังเกตภาคสนาม  ",
      }).caption,
    ).toBe("จุดสังเกตภาคสนาม");

    expect(
      normalizePatientEvidenceCreateInput({
        relationshipId,
        declaredMediaType: "image/jpeg",
        bytes: jpegBytes(),
        caption: "   ",
      }).caption,
    ).toBeNull();
  });

  it("rejects captions longer than 500 characters", () => {
    expect(() =>
      normalizePatientEvidenceCreateInput({
        relationshipId,
        declaredMediaType: "image/jpeg",
        bytes: jpegBytes(),
        caption: "ก".repeat(501),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<PatientEvidenceInputError>>({ reason: "CAPTION_TOO_LONG" }),
    );
  });
});
