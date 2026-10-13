import type { PrismaClient } from "@prisma/client";

import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";

import {
  PATIENT_IMPORT_CONTRACT_VERSION,
  type PatientImportDiagnosticCode,
  type PatientImportFieldKey,
  type PatientImportFileMetadata,
  type PatientProvisioningImportCandidate,
} from "../import/patient-import-contract";

export type PatientRosterImportDatabase = PrismaClient;

export type PatientRosterImportServiceDependencies = {
  database?: PatientRosterImportDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientImportOptions = {
  effectiveDate?: string | null;
  importContractVersion?: string;
};

/**
 * Import creates new patients only. `ALREADY_EXISTS` and `CONFLICT` for a patient
 * that already has a relationship with the target Hospital come from an identity
 * check alone; nothing else in the file is applied to them.
 */
export type PatientImportClassification =
  | "READY"
  | "ALREADY_EXISTS"
  | "DUPLICATE_IN_FILE"
  | "INVALID"
  | "CONFLICT";

export type PatientImportBaselineStatus =
  | "NOT_APPLICABLE"
  | "BASELINE_READY"
  | "BASELINE_CREATED"
  | "BASELINE_DATE_REQUIRED"
  | "BASELINE_DATA_INVALID";

export type PatientImportClassificationStatus =
  | "NOT_APPLICABLE"
  | "CLASSIFICATION_READY"
  | "CLASSIFICATION_ALREADY_EXISTS"
  | "CLASSIFICATION_DATA_INVALID";

export type PatientImportClassificationPreview = {
  status: PatientImportClassificationStatus;
  sourceClassification: PatientClassificationType | null;
};

export type PatientImportPreviewRow = {
  rowNumber: number;
  identityDisplay: string;
  givenName: string;
  familyName: string;
  hospitalNumber: string | null;
  classification: PatientImportClassification;
  reason: string | null;
  baselineStatus: PatientImportBaselineStatus;
  requirementGatedFields: readonly PatientImportFieldKey[];
  diagnosticCodes: readonly PatientImportDiagnosticCode[];
  patientClassification: PatientImportClassificationPreview;
};

export type PatientImportPreview = {
  targetHospitalId: string;
  effectiveDate: string | null;
  importContractVersion: typeof PATIENT_IMPORT_CONTRACT_VERSION;
  baselineDateRequired: boolean;
  rows: PatientImportPreviewRow[];
  file: PatientImportFileMetadata | null;
};

export type PatientImportRowResult = PatientImportPreviewRow & {
  result:
    | "IMPORTED"
    | "ALREADY_EXISTS"
    | "DUPLICATE_IN_FILE"
    | "INVALID"
    | "CONFLICT"
    | "FAILED";
};

export type PatientImportResultSummary = {
  targetHospitalId: string;
  imported: number;
  alreadyExists: number;
  duplicateInFile: number;
  invalid: number;
  conflict: number;
  failed: number;
  baselineCreated: number;
  classificationCreated: number;
  rows: PatientImportRowResult[];
  file: PatientImportFileMetadata | null;
};

type PatientImportAttentionState =
  | PatientImportClassification
  | PatientImportRowResult["result"];

function isPatientImportAttentionState(state: PatientImportAttentionState): boolean {
  return state !== "READY" && state !== "IMPORTED" && state !== "ALREADY_EXISTS";
}

export function isPatientImportAttentionClassification(
  classification: PatientImportClassification,
): boolean {
  return isPatientImportAttentionState(classification);
}

export function isPatientImportAttentionResult(
  result: PatientImportRowResult["result"],
): boolean {
  return isPatientImportAttentionState(result);
}

export type { PatientProvisioningImportCandidate };
