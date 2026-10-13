import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env/server";
import { ApplicationError, ValidationError } from "@/shared/errors/application-error";

import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";

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
  effectiveDate: string | null = null,
  importContractVersion: string = PATIENT_IMPORT_CONTRACT_VERSION,
): string {
  return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
    .update(
      `${PREVIEW_BINDING_CONTEXT}\u0000${importContractVersion}\u0000${actorUserId}\u0000${targetHospitalId}\u0000${effectiveDate ?? ""}\u0000${fileFingerprint}`,
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
  effectiveDate: string | null = null,
  importContractVersion: string = PATIENT_IMPORT_CONTRACT_VERSION,
): boolean {
  if (!isPatientImportFileFingerprint(fileFingerprint) || !isPatientImportFileFingerprint(previewBinding)) {
    return false;
  }

  const expectedBinding = createPatientImportPreviewBinding(
    fileFingerprint,
    targetHospitalId,
    actorUserId,
    effectiveDate,
    importContractVersion,
  );

  return timingSafeEqual(Buffer.from(previewBinding, "hex"), Buffer.from(expectedBinding, "hex"));
}

export class PatientImportPreviewBindingError extends ApplicationError {
  constructor() {
    super("VALIDATION", "The patient import preview is stale");
    this.name = "PatientImportPreviewBindingError";
  }
}

/**
 * The file is re-sent on confirm (and on failed-rows export); the preview binding
 * proves it is the file previewed by this actor for this Hospital and contract.
 */
export async function assertPatientImportPreviewBinding(input: {
  actorUserId: string;
  targetHospitalId: string;
  previewTargetHospitalId: string;
  fileFingerprint: string;
  previewBinding: string;
  effectiveDate: string | null;
  importContractVersion: string;
  file: PatientImportFileSource;
}): Promise<void> {
  if (
    input.targetHospitalId !== input.previewTargetHospitalId ||
    !matchesPatientImportPreviewBinding(
      input.previewBinding,
      input.fileFingerprint,
      input.previewTargetHospitalId,
      input.actorUserId,
      input.effectiveDate,
      input.importContractVersion,
    )
  ) {
    throw new PatientImportPreviewBindingError();
  }

  const actualFingerprint = await hashPatientImportFile(input.file);

  if (!matchesPatientImportFileFingerprint(actualFingerprint, input.fileFingerprint)) {
    throw new PatientImportPreviewBindingError();
  }
}
