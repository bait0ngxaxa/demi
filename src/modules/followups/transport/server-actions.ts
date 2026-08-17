"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import { followupCreateRequestSchema } from "../schemas/followup-schemas";
import { createFollowup } from "../services/followup-service";

import type { FollowupActionState } from "./action-state";

const FOLLOWUP_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "submissionNonce",
  "appointmentId",
  "sourceGoalPlanId",
  "weight",
  "waistCircumference",
  "systolicBloodPressure",
  "diastolicBloodPressure",
  "bloodSugar",
  "confidenceScore",
  "reflectionNote",
  "confidencePlan",
  "generalNote",
  "activityProgress",
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
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasUnexpectedOrDuplicateFields(formData: FormData): boolean {
  const seen = new Set<string>();

  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION_")) {
      continue;
    }

    if (!FOLLOWUP_FORM_FIELDS.has(key) || seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function parseActivityProgress(formData: FormData): unknown {
  const raw = getSingleString(formData, "activityProgress");

  if (raw === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function buildSubmissionInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    appointmentId: getOptionalString(formData, "appointmentId"),
    sourceGoalPlanId: getOptionalString(formData, "sourceGoalPlanId"),
    weight: getOptionalNumber(formData, "weight"),
    waistCircumference: getOptionalNumber(formData, "waistCircumference"),
    systolicBloodPressure: getOptionalNumber(formData, "systolicBloodPressure"),
    diastolicBloodPressure: getOptionalNumber(formData, "diastolicBloodPressure"),
    bloodSugar: getOptionalNumber(formData, "bloodSugar"),
    confidenceScore: getOptionalNumber(formData, "confidenceScore"),
    reflectionNote: getOptionalString(formData, "reflectionNote"),
    confidencePlan: getOptionalString(formData, "confidencePlan"),
    generalNote: getOptionalString(formData, "generalNote"),
    activityProgress: parseActivityProgress(formData),
  } satisfies Record<string, unknown>;
}

function mapFollowupError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบข้อมูลวัดผล ความคืบหน้ากิจกรรม และข้อความก่อนส่งอีกครั้ง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์บันทึก Follow-up สำหรับผู้ป่วยรายนี้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message: "การส่ง Follow-up นี้ขัดแย้งกับข้อมูลล่าสุด หรือ submission token ถูกใช้แล้ว",
      };
    }

    if (error.code === "NOT_FOUND") {
      return {
        code: "FORBIDDEN",
        message: "ไม่พบผู้ป่วย Appointment หรือ Goal Plan ในขอบเขตที่บัญชีนี้เข้าถึงได้",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึก Follow-up ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function revalidateFollowupPaths(relationshipId: string, followupId: string): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/followups`);
  revalidatePath(`/app/patients/${relationshipId}/followups/${followupId}`);
}

export async function createFollowupAction(
  _previousState: FollowupActionState,
  formData: FormData,
): Promise<FollowupActionState> {
  const rawInput = buildSubmissionInput(formData);
  const parsed = followupCreateRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูล Follow-up ก่อนส่งอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await createFollowup(actor, parsed.data);
    revalidateFollowupPaths(result.patientHospitalRelationshipId, result.followupId);

    return {
      status: "SUCCESS",
      result: {
        followupId: result.followupId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        roundNumber: result.roundNumber,
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapFollowupError(error) };
  }
}

export const followupTransportInternals = {
  buildSubmissionInput,
  hasUnexpectedOrDuplicateFields,
  mapFollowupError,
  parseActivityProgress,
};
