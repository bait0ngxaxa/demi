import type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";

export const PATIENT_IMPORT_FIELD_KEYS = [
  "nationalId",
  "dateOfBirth",
  "givenName",
  "familyName",
  "combinedNameText",
  "hospitalNumber",
  "gender",
  "phoneNumber",
  "weight",
  "height",
  "waistCircumference",
  "diabetesClassification",
  "bloodSugar",
  "hba1c",
  "hospitalName",
  "subHospitalName",
  "organizationCombinedText",
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
  "osmCaregiverName",
  "sourceSequenceNumber",
  "externalPatientId",
  "ageAtRoster",
  "addressText",
  "bloodPressureText",
  "pulseRate",
  "bmi",
  "dtxReading",
  "riskFactorText",
  "serviceVisitDate",
  "extendedMeasurementSeries",
] as const;

export type PatientImportFieldKey = (typeof PATIENT_IMPORT_FIELD_KEYS)[number];

export type PatientImportFieldStatus =
  | "NOT_PRESENT"
  | "SUPPORTED_FOR_CURRENT_PROVISIONING"
  | "PARSED_REQUIREMENT_GATED"
  | "UNKNOWN_SOURCE_HEADER"
  | "INVALID"
  | "AMBIGUOUS";

export type PatientImportDiagnosticCode =
  | "UNKNOWN_HEADER"
  | "AMBIGUOUS_HEADER"
  | "MISSING_REQUIRED_HEADER"
  | "INVALID_VALUE"
  | "LOSSY_EXCEL_VALUE"
  | "AMBIGUOUS_VALUE"
  | "REQUIREMENT_GATED"
  | "UNSUPPORTED_REQUIREMENT"
  | "FORMULA_VALUE"
  | "EXCEL_ERROR"
  | "UNIT_NOT_CONFIRMED"
  | "DUPLICATE_SOURCE_ROW";

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

export type PatientImportLayoutKey =
  | "CURRENT_MINIMAL"
  | "OPERATIONAL_ROSTER"
  | "EXTENDED_ROSTER"
  | "COMBINED_NAME_REVIEW"
  | "UNKNOWN";

export type PatientImportDateFormat = "DMY" | "UNKNOWN";

export type PatientImportFileMetadata = {
  worksheetName: string;
  headerRowNumber: number;
  layout: PatientImportLayoutKey;
  dateFormat: PatientImportDateFormat;
  recognizedHeaders: readonly string[];
  requirementGatedFields: readonly PatientImportFieldKey[];
  unknownHeaders: readonly string[];
  ambiguousHeaders: readonly string[];
  diagnostics: readonly PatientImportDiagnostic[];
};

export type ExtendedMeasurementCandidate = {
  sourceHeader: string;
  sourceColumn: number;
  observationNumber: number | null;
  serviceVisitDate: string | null;
  weight: number | null;
  waistCircumference: number | null;
  dtxReading: number | null;
  summaryText: string | null;
  diagnostics: readonly PatientImportDiagnosticCode[];
};

export type CanonicalPatientImportRow = {
  provenance: {
    sourceSheetName: string;
    sourceRowNumber: number;
    sourceSequenceNumber: string | null;
  };
  identity: {
    nationalId: string | null;
    externalPatientId: string | null;
    givenName: string | null;
    familyName: string | null;
    combinedNameText: string | null;
    ageAtRoster: number | null;
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
    addressText: string | null;
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
    heightUnit: "cm" | "m" | null;
    waistCircumference: number | null;
    diabetesClassification: string | null;
    bloodSugar: number | null;
    hba1c: number | null;
    bloodPressureText: string | null;
    pulseRate: number | null;
    bmi: number | null;
    dtxReading: number | null;
    riskFactorText: string | null;
    serviceVisitDate: string | null;
    extendedMeasurementSeries: readonly ExtendedMeasurementCandidate[];
  };
  organizationCandidates: {
    hospitalNumber: string | null;
    hospitalName: string | null;
    subHospitalName: string | null;
    organizationCombinedText: string | null;
  };
  caregiverCandidates: {
    osmCaregiverName: string | null;
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
  combinedNameText: string | null;
  hospitalNumber: string | null;
  validationMessage: string | null;
  canonicalRow: CanonicalPatientImportRow;
  fileMetadata?: PatientImportFileMetadata;
};
