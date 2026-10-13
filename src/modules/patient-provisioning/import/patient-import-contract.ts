import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";

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
  "sourceSequenceNumber",
] as const;

export type PatientImportFieldKey = (typeof PATIENT_IMPORT_FIELD_KEYS)[number];

export const PATIENT_IMPORT_CONTRACT_VERSION = "patient-import-v2-hospital-template" as const;

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

export type PatientImportFieldStatus =
  | "NOT_PRESENT"
  | "SUPPORTED_FOR_CURRENT_PROVISIONING"
  | "PARSED_FOR_INITIAL_BASELINE"
  | "SUPPORTED_FOR_PATIENT_CLASSIFICATION"
  | "PARSED_REQUIREMENT_GATED"
  | "INVALID"
  | "AMBIGUOUS";

export type PatientImportDiagnosticCode =
  | "INVALID_VALUE"
  | "LOSSY_EXCEL_VALUE"
  | "AMBIGUOUS_VALUE"
  | "REQUIREMENT_GATED"
  | "FORMULA_VALUE"
  | "EXCEL_ERROR"
  | "CLASSIFICATION_DATA_INVALID";

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
