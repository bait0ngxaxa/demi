import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import type { HealthHistoryAnswer } from "@/modules/patient-hospital-profile/schemas/patient-health-history-schemas";

import type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";

export const PATIENT_IMPORT_FIELD_KEYS = [
  "nationalId",
  "dateOfBirth",
  "givenName",
  "familyName",
  "hospitalNumber",
  "gender",
  "phoneNumber",
  "weight",
  "height",
  "waistCircumference",
  "diabetesClassification",
  "bloodSugarDtx",
  "hba1c",
  "houseNumber",
  "villageNumber",
  "villageName",
  "soi",
  "road",
  "province",
  "district",
  "subdistrict",
  "postalCode",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelationship",
  "historyDiabetes",
  "historyHypertension",
  "otherConditions",
  "familyHypertension",
  "familyDiabetes",
  "familyHeartDisease",
  "familyStroke",
  "sourceSequenceNumber",
] as const;

export type PatientImportFieldKey = (typeof PATIENT_IMPORT_FIELD_KEYS)[number];

export const PATIENT_IMPORT_CONTRACT_VERSION = "patient-import-v3-initial-health-data" as const;

export const PATIENT_IMPORT_BASELINE_FIELD_KEYS = [
  "weight",
  "height",
  "waistCircumference",
  "bloodSugarDtx",
  "hba1c",
] as const satisfies readonly PatientImportFieldKey[];

export type PatientImportBaselineFieldKey = (typeof PATIENT_IMPORT_BASELINE_FIELD_KEYS)[number];

export function isPatientImportBaselineField(
  field: PatientImportFieldKey,
): field is PatientImportBaselineFieldKey {
  return PATIENT_IMPORT_BASELINE_FIELD_KEYS.some((baselineField) => baselineField === field);
}

export function isPatientImportClassificationField(
  field: PatientImportFieldKey,
): field is "diabetesClassification" {
  return field === "diabetesClassification";
}

/** Template columns persisted to PatientHospitalHealthHistory for a new relationship. */
export const PATIENT_IMPORT_HEALTH_HISTORY_FIELD_KEYS = [
  "historyDiabetes",
  "historyHypertension",
  "otherConditions",
  "familyHypertension",
  "familyDiabetes",
  "familyHeartDisease",
  "familyStroke",
] as const satisfies readonly PatientImportFieldKey[];

export type PatientImportHealthHistoryFieldKey = (typeof PATIENT_IMPORT_HEALTH_HISTORY_FIELD_KEYS)[number];

export function isPatientImportHealthHistoryField(
  field: PatientImportFieldKey,
): field is PatientImportHealthHistoryFieldKey {
  return PATIENT_IMPORT_HEALTH_HISTORY_FIELD_KEYS.some((historyField) => historyField === field);
}

/** Every patient field is persisted for new relationships, subject to clinical rules. */
export const PATIENT_IMPORT_SAVED_FIELD_KEYS = PATIENT_IMPORT_FIELD_KEYS.filter(
  (field) => field !== "sourceSequenceNumber",
);

/** Source sequence is traceability metadata, not a patient attribute. */
export const PATIENT_IMPORT_UNSAVED_FIELD_KEYS: readonly PatientImportFieldKey[] = ["sourceSequenceNumber"];

export type PatientImportFieldStatus =
  | "NOT_PRESENT"
  | "SUPPORTED_FOR_CURRENT_PROVISIONING"
  | "PARSED_FOR_INITIAL_BASELINE"
  | "SUPPORTED_FOR_PATIENT_CLASSIFICATION"
  | "SUPPORTED_FOR_HEALTH_HISTORY"
  | "IMPORT_METADATA"
  | "INVALID"
  | "AMBIGUOUS";

export type PatientImportDiagnosticCode =
  | "INVALID_VALUE"
  | "LOSSY_EXCEL_VALUE"
  | "AMBIGUOUS_VALUE"
  | "FORMULA_VALUE"
  | "EXCEL_ERROR"
  | "CLASSIFICATION_DATA_INVALID"
  | "HEALTH_HISTORY_DATA_INVALID";

export type PatientImportDiagnostic = {
  code: PatientImportDiagnosticCode;
  message: string;
  field?: PatientImportFieldKey;
  sourceHeader?: string;
};

export type PatientImportFieldAssessment = {
  status: PatientImportFieldStatus;
  present: boolean;
  sourceHeaders: readonly string[];
  diagnostics: readonly PatientImportDiagnosticCode[];
};

export type PatientImportFieldAssessmentMap = {
  [Field in PatientImportFieldKey]: PatientImportFieldAssessment;
};

export type PatientImportDateFormat = "DMY" | "UNKNOWN";

export type PatientImportFileMetadata = {
  worksheetName: string;
  headerRowNumber: number;
  templateVersion: string;
  hospitalCode: string;
  requirementGatedFields: readonly PatientImportFieldKey[];
};

export type CanonicalPatientImportRow = {
  provenance: {
    sourceSheetName: string;
    sourceRowNumber: number;
    sourceSequenceNumber: string | null;
  };
  identity: {
    nationalId: string | null;
    givenName: string | null;
    familyName: string | null;
  };
  demographics: {
    dateOfBirth: string | null;
    gender: string | null;
  };
  contact: {
    phoneNumber: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelationship: string | null;
  };
  address: {
    houseNumber: string | null;
    villageNumber: string | null;
    villageName: string | null;
    soi: string | null;
    road: string | null;
    province: string | null;
    district: string | null;
    subdistrict: string | null;
    postalCode: string | null;
  };
  clinicalCandidates: {
    weight: number | null;
    height: number | null;
    waistCircumference: number | null;
    diabetesClassification: PatientClassificationType | null;
    bloodSugarDtx: number | null;
    hba1c: number | null;
  };
  organizationCandidates: {
    hospitalNumber: string | null;
  };
  /** Blank answers are already UNKNOWN here; a blank other-conditions cell stays null. */
  healthHistoryCandidates: {
    diabetes: HealthHistoryAnswer;
    hypertension: HealthHistoryAnswer;
    otherConditions: string | null;
    familyHypertension: HealthHistoryAnswer;
    familyDiabetes: HealthHistoryAnswer;
    familyHeartDisease: HealthHistoryAnswer;
    familyStroke: HealthHistoryAnswer;
  };
  fieldAssessments: PatientImportFieldAssessmentMap;
  diagnostics: readonly PatientImportDiagnostic[];
};

export type PatientProvisioningImportCandidate = {
  rowNumber: number;
  identityDisplay: string;
  input: ProvisionPatientInput | null;
  givenName: string;
  familyName: string;
  hospitalNumber: string | null;
  validationMessage: string | null;
  canonicalRow: CanonicalPatientImportRow;
  fileMetadata?: PatientImportFileMetadata;
};
