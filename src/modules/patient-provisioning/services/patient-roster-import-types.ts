import type { PrismaClient } from "@prisma/client";

import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";

import {
  PATIENT_IMPORT_CONTRACT_VERSION,
  type PatientImportDiagnosticCode,
  type PatientImportFieldKey,
  type PatientImportFileMetadata,
  type PatientProvisioningImportCandidate,
} from "../import/patient-import-contract";
import type {
  PatientOsmRosterAssignmentChoice,
  PatientOsmRosterAssignmentPreviewInternal,
  PatientOsmRosterAssignmentStatus,
  PatientOsmRosterResolutionStatus,
} from "@/modules/patient-assignment/services/patient-osm-roster-resolver";

export type PatientRosterImportDatabase = PrismaClient;

export type PatientRosterImportServiceDependencies = {
  database?: PatientRosterImportDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientImportOptions = {
  effectiveDate?: string | null;
  importContractVersion?: string;
  classificationReconciliationChoices?: readonly PatientImportClassificationReconciliationChoice[];
  osmAssignmentChoices?: readonly PatientImportOsmAssignmentChoice[];
};

export type PatientImportClassification =
  | "READY"
  | "ALREADY_EXISTS"
  | "DUPLICATE_IN_FILE"
  | "INVALID"
  | "CONFLICT"
  | "NEEDS_REVIEW"
  | "HOSPITAL_MISMATCH"
  | "UNSUPPORTED_REQUIREMENT";

export type PatientImportBaselineStatus =
  | "NOT_APPLICABLE"
  | "BASELINE_READY"
  | "BASELINE_CREATED"
  | "BASELINE_ALREADY_EXISTS"
  | "BASELINE_CONFLICT"
  | "BASELINE_DATE_REQUIRED"
  | "BASELINE_DATA_INVALID";

export type PatientImportClassificationStatus =
  | "NOT_APPLICABLE"
  | "CLASSIFICATION_READY"
  | "CLASSIFICATION_ALREADY_EXISTS"
  | "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION"
  | "CLASSIFICATION_DATA_INVALID";

export type PatientImportClassificationReconciliation = {
  rowNumber: number;
  currentClassification: PatientClassificationType;
  sourceClassification: PatientClassificationType;
};

export type PatientImportClassificationReconciliationChoice =
  PatientImportClassificationReconciliation;

export type PatientImportClassificationPreview = {
  status: PatientImportClassificationStatus;
  currentClassification: PatientClassificationType | null;
  sourceClassification: PatientClassificationType | null;
};

export type PatientImportOsmCandidatePreview = {
  displayName: string;
};

export type PatientImportOsmAssignmentPreview = {
  resolutionStatus: PatientOsmRosterResolutionStatus;
  assignmentStatus: PatientOsmRosterAssignmentStatus | null;
  sourceCaregiverName: string | null;
  currentCaregiver: { displayName: string } | null;
  resolvedCandidate: PatientImportOsmCandidatePreview | null;
  candidates: readonly PatientImportOsmCandidatePreview[];
};

export type PatientImportOsmAssignmentChoice = PatientOsmRosterAssignmentChoice;

export type PatientImportPreviewRow = {
  rowNumber: number;
  identityDisplay: string;
  givenName: string;
  familyName: string;
  combinedNameText: string | null;
  hospitalNumber: string | null;
  classification: PatientImportClassification;
  reason: string | null;
  baselineStatus: PatientImportBaselineStatus;
  requirementGatedFields: readonly PatientImportFieldKey[];
  diagnosticCodes: readonly PatientImportDiagnosticCode[];
  patientClassification: PatientImportClassificationPreview;
  patientOsmAssignment: PatientImportOsmAssignmentPreview;
};

export type PatientImportPreviewRowInternal = Omit<PatientImportPreviewRow, "patientOsmAssignment"> & {
  patientOsmAssignment: PatientOsmRosterAssignmentPreviewInternal;
};

export type PatientImportPreview = {
  targetHospitalId: string;
  effectiveDate: string | null;
  importContractVersion: typeof PATIENT_IMPORT_CONTRACT_VERSION;
  baselineDateRequired: boolean;
  canManageOsmAssignment: boolean;
  rows: PatientImportPreviewRow[];
  classificationReconciliations: PatientImportClassificationReconciliation[];
  file: PatientImportFileMetadata | null;
};

export type PatientImportPreviewInternal = Omit<PatientImportPreview, "rows"> & {
  rows: PatientImportPreviewRowInternal[];
};

export type PatientImportRowResult = PatientImportPreviewRow & {
  result:
    | "IMPORTED"
    | "ALREADY_EXISTS"
    | "DUPLICATE_IN_FILE"
    | "INVALID"
    | "CONFLICT"
    | "NEEDS_REVIEW"
    | "HOSPITAL_MISMATCH"
    | "UNSUPPORTED_REQUIREMENT"
    | "FAILED";
};

export type PatientImportResultSummary = {
  targetHospitalId: string;
  imported: number;
  alreadyExists: number;
  duplicateInFile: number;
  invalid: number;
  conflict: number;
  needsReview: number;
  hospitalMismatch: number;
  unsupportedRequirement: number;
  failed: number;
  baselineCreated: number;
  baselineAlreadyExists: number;
  baselineConflict: number;
  baselineInvalid: number;
  baselineDateRequired: number;
  classificationCreated: number;
  classificationAlreadyExists: number;
  classificationChanged: number;
  classificationNeedsReview: number;
  classificationInvalid: number;
  osmAssigned: number;
  osmAlreadyAssigned: number;
  osmReassigned: number;
  osmNotFound: number;
  osmAmbiguous: number;
  osmAssignmentConflict: number;
  osmOwnerRequired: number;
  rows: PatientImportRowResult[];
  file: PatientImportFileMetadata | null;
};

export function isPatientImportAttentionResult(
  result: PatientImportRowResult["result"],
): boolean {
  return result !== "IMPORTED" && result !== "ALREADY_EXISTS";
}

export type { PatientProvisioningImportCandidate };
