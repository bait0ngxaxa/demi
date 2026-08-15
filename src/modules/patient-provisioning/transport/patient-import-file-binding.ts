import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env/server";
import { ValidationError } from "@/shared/errors/application-error";

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
const PREVIEW_BINDING_CONTEXT = "demi:patient-import-preview:v1";

export type PatientImportFileSource = {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export async function hashPatientImportFile(file: PatientImportFileSource): Promise<string> {
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    throw new ValidationError("ไม่สามารถอ่านไฟล์ Excel ได้");
  }
}

export function createPatientImportPreviewBinding(
  fileFingerprint: string,
  targetHospitalId: string,
  actorUserId: string,
): string {
  return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
    .update(
      `${PREVIEW_BINDING_CONTEXT}\u0000${actorUserId}\u0000${targetHospitalId}\u0000${fileFingerprint}`,
      "utf8",
    )
    .digest("hex");
}

export function isPatientImportFileFingerprint(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}

export function matchesPatientImportFileFingerprint(actual: string, expected: string): boolean {
  if (!isPatientImportFileFingerprint(actual) || !isPatientImportFileFingerprint(expected)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function matchesPatientImportPreviewBinding(
  previewBinding: string,
  fileFingerprint: string,
  targetHospitalId: string,
  actorUserId: string,
): boolean {
  if (!isPatientImportFileFingerprint(fileFingerprint) || !isPatientImportFileFingerprint(previewBinding)) {
    return false;
  }

  const expectedBinding = createPatientImportPreviewBinding(
    fileFingerprint,
    targetHospitalId,
    actorUserId,
  );

  return timingSafeEqual(Buffer.from(previewBinding, "hex"), Buffer.from(expectedBinding, "hex"));
}
