import { ApplicationError } from "@/shared/errors/application-error";

const FINAL_ASSESSMENT_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "patientProgramId",
  "weight",
  "waistCircumference",
  "systolicBloodPressure",
  "diastolicBloodPressure",
  "bloodSugar",
]);

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}

function getOptionalNumber(formData: FormData, field: string): number | null | undefined {
  const values = formData.getAll(field);

  if (values.length === 0) {
    return null;
  }

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  const rawValue = values[0].trim();

  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function hasUnexpectedOrDuplicateFields(formData: FormData): boolean {
  const seen = new Set<string>();

  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION_")) {
      continue;
    }

    if (!FINAL_ASSESSMENT_FORM_FIELDS.has(key) || seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

export function buildCreateInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(
      formData,
      "patientHospitalRelationshipId",
    ),
    patientProgramId: getSingleString(formData, "patientProgramId"),
    weight: getOptionalNumber(formData, "weight"),
    waistCircumference: getOptionalNumber(formData, "waistCircumference"),
    systolicBloodPressure: getOptionalNumber(formData, "systolicBloodPressure"),
    diastolicBloodPressure: getOptionalNumber(formData, "diastolicBloodPressure"),
    bloodSugar: getOptionalNumber(formData, "bloodSugar"),
  } satisfies Record<string, unknown>;
}

export function mapPatientFinalAssessmentError(error: unknown): {
  code: "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบแบบฟอร์ม Final Assessment และกรอกข้อมูลอย่างน้อย 1 รายการก่อนบันทึก",
      };
    }

    if (error.code === "UNAUTHENTICATED") {
      return {
        code: "UNAUTHENTICATED",
        message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ก่อนบันทึกข้อมูล",
      };
    }

    if (error.code === "FORBIDDEN") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์บันทึก Final Assessment สำหรับโปรแกรมนี้",
      };
    }

    if (error.code === "NOT_FOUND") {
      return {
        code: "NOT_FOUND",
        message: "ไม่พบโปรแกรมในขอบเขตที่บัญชีนี้เข้าถึงได้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message: "ไม่สามารถบันทึก Final Assessment ได้ โปรแกรมอาจจบแล้วหรือมีข้อมูลถูกบันทึกไว้แล้ว กรุณาตรวจสอบข้อมูลล่าสุด",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึก Final Assessment ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

export const patientFinalAssessmentTransportInternals = {
  buildCreateInput,
  hasUnexpectedOrDuplicateFields,
  mapPatientFinalAssessmentError,
};
