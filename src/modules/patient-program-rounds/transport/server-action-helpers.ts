import { roundConflictMessage } from "@/modules/patient-program-rounds/domain/round-conflict-error";
import { ApplicationError } from "@/shared/errors/application-error";

const VITALS_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "patientProgramId",
  "roundNumber",
  "submissionNonce",
  "serviceDate",
  "weight",
  "heightCm",
  "waistCircumference",
  "systolicBloodPressure",
  "diastolicBloodPressure",
  "bloodSugar",
  "preferredName",
  "occupation",
  "profileVersion",
]);

const PROFILE_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "patientProgramId",
  "roundNumber",
  "preferredName",
  "occupation",
  "profileVersion",
]);

const STEP_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "patientProgramId",
  "roundNumber",
  "planItemId",
  "reasonCode",
  "note",
]);

const COMPLETION_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "patientProgramId",
  "roundNumber",
  "submissionNonce",
]);

const REVIEW_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "patientProgramId",
  "roundNumber",
  "submissionNonce",
  "toolCode",
]);

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}

function getRoundNumber(formData: FormData): number | undefined {
  const value = getSingleString(formData, "roundNumber");

  return value !== undefined && /^\d+$/u.test(value) ? Number(value) : undefined;
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

function hasUnexpectedOrDuplicateFields(formData: FormData, allowed: ReadonlySet<string>): boolean {
  const seen = new Set<string>();

  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION_")) {
      continue;
    }

    if (!allowed.has(key) || seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

export function buildVitalsInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, VITALS_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getRoundNumber(formData),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    serviceDate: getSingleString(formData, "serviceDate"),
    weight: getOptionalNumber(formData, "weight"),
    heightCm: getOptionalNumber(formData, "heightCm"),
    waistCircumference: getOptionalNumber(formData, "waistCircumference"),
    systolicBloodPressure: getOptionalNumber(formData, "systolicBloodPressure"),
    diastolicBloodPressure: getOptionalNumber(formData, "diastolicBloodPressure"),
    bloodSugar: getOptionalNumber(formData, "bloodSugar"),
    ...buildProfileFields(formData),
  } satisfies Record<string, unknown>;
}

function buildProfileFields(formData: FormData): Record<string, unknown> {
  return {
    preferredName: getOptionalText(formData, "preferredName"),
    occupation: getOptionalText(formData, "occupation"),
    profileVersion: getOptionalNumber(formData, "profileVersion"),
  };
}

function getOptionalText(formData: FormData, field: string): string | null | undefined {
  const values = formData.getAll(field);

  if (values.length === 0) {
    return null;
  }

  return values.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}

export function buildProfileInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, PROFILE_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getRoundNumber(formData),
    ...buildProfileFields(formData),
  } satisfies Record<string, unknown>;
}

export function buildStepSkipInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, STEP_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getRoundNumber(formData),
    planItemId: getSingleString(formData, "planItemId"),
    reasonCode: getSingleString(formData, "reasonCode"),
    note: getOptionalText(formData, "note"),
  } satisfies Record<string, unknown>;
}

export function buildStepUnskipInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, STEP_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getRoundNumber(formData),
    planItemId: getSingleString(formData, "planItemId"),
  } satisfies Record<string, unknown>;
}

export function buildCompletionInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, COMPLETION_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getRoundNumber(formData),
    submissionNonce: getSingleString(formData, "submissionNonce"),
  } satisfies Record<string, unknown>;
}

export function buildReviewInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, REVIEW_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getRoundNumber(formData),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    toolCode: getSingleString(formData, "toolCode"),
  } satisfies Record<string, unknown>;
}

export function mapPatientProgramRoundError(error: unknown): {
  code: "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบข้อมูลที่กรอก (วันที่ต้องไม่เป็นวันในอนาคต และกรอกค่าที่จำเป็นให้ครบ) แล้วลองอีกครั้ง",
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
        message: "บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลครั้งนี้สำหรับโปรแกรมนี้",
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
        message:
          roundConflictMessage(error) ??
          "ไม่สามารถบันทึกได้ โปรแกรมอาจจบแล้ว หรือครั้งนี้มีข้อมูลบันทึกไว้แล้ว กรุณาตรวจสอบข้อมูลล่าสุด",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึกข้อมูลในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

export const patientProgramRoundTransportInternals = {
  buildCompletionInput,
  buildProfileInput,
  buildReviewInput,
  buildStepSkipInput,
  buildStepUnskipInput,
  buildVitalsInput,
  hasUnexpectedOrDuplicateFields,
  mapPatientProgramRoundError,
  REVIEW_FORM_FIELDS,
  VITALS_FORM_FIELDS,
};
