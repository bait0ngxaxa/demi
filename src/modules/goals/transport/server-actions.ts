"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import { goalPlanSubmitRequestSchema } from "../schemas/goal-schemas";
import { createGoalPlan } from "../services/goal-service";

import type { GoalPlanActionState } from "./action-state";

const GOAL_PLAN_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "submissionNonce",
  "sourceScreeningAssessmentId",
  "primaryGoalCode",
  "primaryGoalNote",
  "weeklyNote",
  "items",
]);

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}

function getOptionalString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length === 0) {
    return undefined;
  }

  return values.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}

function hasUnexpectedOrDuplicateFields(formData: FormData): boolean {
  const seen = new Set<string>();

  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION_")) {
      continue;
    }

    if (!GOAL_PLAN_FORM_FIELDS.has(key) || seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function parseItems(formData: FormData): unknown {
  const rawItems = getSingleString(formData, "items");

  if (rawItems === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(rawItems) as unknown;
  } catch {
    return undefined;
  }
}

function buildSubmissionInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData)) {
    return null;
  }

  const sourceScreeningAssessmentId = getOptionalString(
    formData,
    "sourceScreeningAssessmentId",
  );

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    sourceScreeningAssessmentId: sourceScreeningAssessmentId?.trim() || null,
    primaryGoalCode: getSingleString(formData, "primaryGoalCode"),
    primaryGoalNote: getOptionalString(formData, "primaryGoalNote"),
    weeklyNote: getOptionalString(formData, "weeklyNote"),
    items: parseItems(formData),
  } satisfies Record<string, unknown>;
}

function mapGoalPlanError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบเป้าหมาย กิจกรรม และค่าเป้าหมายก่อนส่งอีกครั้ง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์สร้างแผนเป้าหมายสำหรับผู้ป่วยรายนี้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message: "การบันทึกแผนเป้าหมายนี้เสร็จสิ้นแล้ว หรือข้อมูลเปลี่ยนแปลง กรุณาเริ่มรอบใหม่",
      };
    }

    if (error.code === "NOT_FOUND") {
      return {
        code: "FORBIDDEN",
        message: "ไม่พบผู้ป่วยหรือแบบประเมินในขอบเขตที่บัญชีนี้เข้าถึงได้",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึกแผนเป้าหมายในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function revalidateGoalPlanPaths(relationshipId: string, goalPlanId: string): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/goals`);
  revalidatePath(`/app/patients/${relationshipId}/goals/${goalPlanId}`);
}

export async function submitGoalPlanAction(
  _previousState: GoalPlanActionState,
  formData: FormData,
): Promise<GoalPlanActionState> {
  const rawInput = buildSubmissionInput(formData);
  const parsed = goalPlanSubmitRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบเป้าหมาย กิจกรรม และค่าเป้าหมายก่อนบันทึกอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await createGoalPlan(actor, parsed.data);
    revalidateGoalPlanPaths(result.patientHospitalRelationshipId, result.goalPlanId);

    return {
      status: "SUCCESS",
      result: {
        goalPlanId: result.goalPlanId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        roundNumber: result.roundNumber,
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapGoalPlanError(error) };
  }
}
