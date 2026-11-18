import { ApplicationError } from "@/shared/errors/application-error";

import { PATIENT_BASELINE_LOCKED_NOTICE, PATIENT_BASELINE_LOCKED_MESSAGE } from "../domain/patient-baseline-edit-lock";

export const PATIENT_BASELINE_FORM_FIELDS: ReadonlySet<string> = new Set([
  "patientHospitalRelationshipId",
  "recordedOn",
  "weight",
  "heightCm",
  "waistCircumference",
  "bloodPressureSystolic",
  "bloodPressureDiastolic",
  "bloodSugarDtx",
  "hba1c",
  "cvdRiskScore",
  "adaptationSummary",
  "adaptationObstacles",
  "adaptationOpportunities",
  "confidenceScore",
  "confidenceImprovementPlan",
  "summary",
  "recommendations",
]);

/** The edit form posts the create fields plus the version it was loaded at. */
export const PATIENT_BASELINE_UPDATE_FORM_FIELDS: ReadonlySet<string> = new Set([
  ...PATIENT_BASELINE_FORM_FIELDS,
  "expectedUpdatedAt",
]);

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}

function getOptionalString(formData: FormData, field: string): string | null | undefined {
  const values = formData.getAll(field);

  if (values.length === 0) {
    return null;
  }

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0].trim() || null;
}

function getOptionalNumber(formData: FormData, field: string): number | null | undefined {
  const value = getOptionalString(formData, field);

  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function hasUnexpectedOrDuplicateFields(
  formData: FormData,
  allowedFields: ReadonlySet<string> = PATIENT_BASELINE_FORM_FIELDS,
): boolean {
  const seen = new Set<string>();

  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION_")) {
      continue;
    }

    if (!allowedFields.has(key) || seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function readBaselineFields(formData: FormData): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    recordedOn: getSingleString(formData, "recordedOn"),
    weight: getOptionalNumber(formData, "weight"),
    heightCm: getOptionalNumber(formData, "heightCm"),
    waistCircumference: getOptionalNumber(formData, "waistCircumference"),
    bloodPressureSystolic: getOptionalNumber(formData, "bloodPressureSystolic"),
    bloodPressureDiastolic: getOptionalNumber(formData, "bloodPressureDiastolic"),
    bloodSugarDtx: getOptionalNumber(formData, "bloodSugarDtx"),
    hba1c: getOptionalNumber(formData, "hba1c"),
    cvdRiskScore: getOptionalNumber(formData, "cvdRiskScore"),
    adaptationSummary: getOptionalString(formData, "adaptationSummary"),
    adaptationObstacles: getOptionalString(formData, "adaptationObstacles"),
    adaptationOpportunities: getOptionalString(formData, "adaptationOpportunities"),
    confidenceScore: getOptionalNumber(formData, "confidenceScore"),
    confidenceImprovementPlan: getOptionalString(formData, "confidenceImprovementPlan"),
    summary: getOptionalString(formData, "summary"),
    recommendations: getOptionalString(formData, "recommendations"),
  };
}

export function buildSubmissionInput(formData: FormData): unknown {
  return hasUnexpectedOrDuplicateFields(formData) ? null : readBaselineFields(formData);
}

/** Every editable value is posted: a blank optional field clears it. */
export function buildUpdateSubmissionInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, PATIENT_BASELINE_UPDATE_FORM_FIELDS)) {
    return null;
  }

  return { ...readBaselineFields(formData), expectedUpdatedAt: getSingleString(formData, "expectedUpdatedAt") };
}

export function mapPatientBaselineError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบวันที่และข้อมูลตั้งต้นก่อนบันทึกอีกครั้ง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED" || error.code === "NOT_FOUND") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลตั้งต้นสำหรับผู้ป่วยรายนี้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message: "ข้อมูลตั้งต้นของผู้ป่วยรายนี้ถูกบันทึกไว้แล้ว กรุณาเปิดหน้าข้อมูลตั้งต้นอีกครั้ง",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึกข้อมูลตั้งต้นในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

type PatientBaselineErrorCode = "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";

/** An edit refused because a Program now links the Baseline, or because it changed meanwhile. */
export function mapPatientBaselineUpdateError(error: unknown): { code: PatientBaselineErrorCode; message: string } {
  if (error instanceof ApplicationError && error.code === "CONFLICT") {
    return {
      code: "CONFLICT",
      message: error.message === PATIENT_BASELINE_LOCKED_MESSAGE
        ? PATIENT_BASELINE_LOCKED_NOTICE
        : "ข้อมูลตั้งต้นถูกแก้ไขหรือมีการเปิดโปรแกรมระหว่างนี้ กรุณาเปิดหน้าข้อมูลตั้งต้นอีกครั้ง",
    };
  }

  const mapped = mapPatientBaselineError(error);
  return mapped.code === "FORBIDDEN"
    ? { code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลตั้งต้นสำหรับผู้ป่วยรายนี้" }
    : mapped;
}

export const patientBaselineTransportInternals = {
  buildSubmissionInput,
  buildUpdateSubmissionInput,
  mapPatientBaselineUpdateError,
  hasUnexpectedOrDuplicateFields,
  mapPatientBaselineError,
};
