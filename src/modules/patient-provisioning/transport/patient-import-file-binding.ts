import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env/server";
import { ValidationError } from "@/shared/errors/application-error";

import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";
import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
const PREVIEW_BINDING_CONTEXT = "demi:patient-import-preview:v1";
const CLASSIFICATION_RECONCILIATION_CONTEXT =
  "demi:patient-import-classification-reconciliation:v1";
const OSM_CANDIDATE_CONTEXT = "demi:patient-import-osm-candidate:v1";
const OSM_CANDIDATE_REFERENCE_CONTEXT = "demi:patient-import-osm-candidate-reference:v1";
const OSM_REASSIGNMENT_CONTEXT = "demi:patient-import-osm-reassignment:v1";

type PatientImportOsmResolutionStatus = "OSM_MATCHED" | "OSM_AMBIGUOUS";

type PatientImportOsmBindingInput = {
  fileFingerprint: string;
  targetHospitalId: string;
  actorUserId: string;
  effectiveDate: string | null;
  importContractVersion: string;
  rowNumber: number;
  normalizedSourceCaregiverName: string;
  resolutionStatus: PatientImportOsmResolutionStatus;
  candidateOsmUserId: string;
  currentOsmUserId: string | null;
};

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

export function createPatientImportClassificationReconciliationBinding(input: {
  fileFingerprint: string;
  targetHospitalId: string;
  actorUserId: string;
  effectiveDate: string | null;
  importContractVersion: string;
  rowNumber: number;
  currentClassification: PatientClassificationType;
  sourceClassification: PatientClassificationType;
}): string {
  return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
    .update(
      `${CLASSIFICATION_RECONCILIATION_CONTEXT}\u0000${input.importContractVersion}\u0000${input.actorUserId}\u0000${input.targetHospitalId}\u0000${input.effectiveDate ?? ""}\u0000${input.fileFingerprint}\u0000${input.rowNumber}\u0000${input.currentClassification}\u0000${input.sourceClassification}`,
      "utf8",
    )
    .digest("hex");
}

export function matchesPatientImportClassificationReconciliationBinding(input: {
  binding: string;
  fileFingerprint: string;
  targetHospitalId: string;
  actorUserId: string;
  effectiveDate: string | null;
  importContractVersion: string;
  rowNumber: number;
  currentClassification: PatientClassificationType;
  sourceClassification: PatientClassificationType;
}): boolean {
  if (!isPatientImportFileFingerprint(input.binding) || !isPatientImportFileFingerprint(input.fileFingerprint)) {
    return false;
  }

  const expectedBinding = createPatientImportClassificationReconciliationBinding({
    fileFingerprint: input.fileFingerprint,
    targetHospitalId: input.targetHospitalId,
    actorUserId: input.actorUserId,
    effectiveDate: input.effectiveDate,
    importContractVersion: input.importContractVersion,
    rowNumber: input.rowNumber,
    currentClassification: input.currentClassification,
    sourceClassification: input.sourceClassification,
  });

  return timingSafeEqual(Buffer.from(input.binding, "hex"), Buffer.from(expectedBinding, "hex"));
}

function createPatientImportOsmBinding(
  context: string,
  input: PatientImportOsmBindingInput,
  includeCurrent: boolean,
): string {
  const current = includeCurrent ? input.currentOsmUserId ?? "" : "";

  return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
    .update(
      `${context}\u0000${input.importContractVersion}\u0000${input.actorUserId}\u0000${input.targetHospitalId}\u0000${input.effectiveDate ?? ""}\u0000${input.fileFingerprint}\u0000${input.rowNumber}\u0000${input.resolutionStatus}\u0000${input.normalizedSourceCaregiverName}\u0000${input.candidateOsmUserId}\u0000${current}`,
      "utf8",
    )
    .digest("hex");
}

function matchesPatientImportOsmBinding(
  context: string,
  binding: string,
  input: PatientImportOsmBindingInput,
  includeCurrent: boolean,
): boolean {
  if (!isPatientImportFileFingerprint(binding) || !isPatientImportFileFingerprint(input.fileFingerprint)) {
    return false;
  }

  const expectedBinding = createPatientImportOsmBinding(context, input, includeCurrent);

  return timingSafeEqual(Buffer.from(binding, "hex"), Buffer.from(expectedBinding, "hex"));
}

export function createPatientImportOsmCandidateBinding(
  input: PatientImportOsmBindingInput,
): string {
  return createPatientImportOsmBinding(OSM_CANDIDATE_CONTEXT, input, true);
}

export function matchesPatientImportOsmCandidateBinding(input: {
  binding: string;
  input: PatientImportOsmBindingInput;
}): boolean {
  return matchesPatientImportOsmBinding(
    OSM_CANDIDATE_CONTEXT,
    input.binding,
    input.input,
    true,
  );
}

export function createPatientImportOsmCandidateReferenceBinding(
  input: PatientImportOsmBindingInput,
): string {
  return createPatientImportOsmBinding(OSM_CANDIDATE_REFERENCE_CONTEXT, input, false);
}

export function matchesPatientImportOsmCandidateReferenceBinding(input: {
  binding: string;
  input: PatientImportOsmBindingInput;
}): boolean {
  return matchesPatientImportOsmBinding(
    OSM_CANDIDATE_REFERENCE_CONTEXT,
    input.binding,
    input.input,
    false,
  );
}

export function createPatientImportOsmReassignmentBinding(
  input: PatientImportOsmBindingInput,
): string {
  return createPatientImportOsmBinding(OSM_REASSIGNMENT_CONTEXT, input, true);
}

export function matchesPatientImportOsmReassignmentBinding(input: {
  binding: string;
  input: PatientImportOsmBindingInput;
}): boolean {
  return matchesPatientImportOsmBinding(
    OSM_REASSIGNMENT_CONTEXT,
    input.binding,
    input.input,
    true,
  );
}
