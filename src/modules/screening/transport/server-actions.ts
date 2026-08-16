"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  getPrototypeQuestionSet,
  type ScreeningQuestionSection,
} from "../domain/question-sets";
import {
  screeningSubmitRequestSchema,
  type NormalizedScreeningSubmitRequest,
} from "../schemas/screening-schemas";
import { submitScreening } from "../services/screening-service";

import type { ScreeningActionState } from "./action-state";

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

function getAnswerValue(formData: FormData, key: string): unknown {
  const value = getSingleString(formData, key);

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return Number(value);
}

function buildAnswerMap(
  formData: FormData,
  questionSet: ReturnType<typeof getPrototypeQuestionSet>,
  section: ScreeningQuestionSection,
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (const question of questionSet.questions) {
    if (question.section === section) {
      answers[question.key] = getAnswerValue(formData, question.key);
    }
  }

  return answers;
}

function containsUnexpectedFields(
  formData: FormData,
  questionSet: ReturnType<typeof getPrototypeQuestionSet>,
): boolean {
  const allowedFields = new Set([
    "patientHospitalRelationshipId",
    "submissionNonce",
    "confidenceScore",
    "confidenceImprovementPlan",
    ...questionSet.questions.map((question) => question.key),
  ]);

  for (const key of formData.keys()) {
    if (!key.startsWith("$ACTION_") && !allowedFields.has(key)) {
      return true;
    }
  }

  return false;
}

function buildSubmissionInput(formData: FormData): unknown {
  const questionSet = getPrototypeQuestionSet();

  if (containsUnexpectedFields(formData, questionSet)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    responses: {
      pam: buildAnswerMap(formData, questionSet, "PAM"),
      proms: buildAnswerMap(formData, questionSet, "PROMs"),
      confidenceScore: getAnswerValue(formData, "confidenceScore"),
      confidenceImprovementPlan: getOptionalString(formData, "confidenceImprovementPlan"),
    },
  } satisfies Record<string, unknown>;
}

function mapScreeningError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "กรุณาตอบคำถามทุกข้อ ตรวจสอบคะแนน และลองส่งอีกครั้ง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์ทำ Screening สำหรับผู้ป่วยรายนี้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message: "การส่ง Screening นี้ถูกบันทึกแล้ว หรือข้อมูลเปลี่ยนแปลง กรุณาเปิดประวัติอีกครั้ง",
      };
    }

    if (error.code === "NOT_FOUND") {
      return {
        code: "FORBIDDEN",
        message: "ไม่พบผู้ป่วยในขอบเขตที่บัญชีนี้เข้าถึงได้",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึก Screening ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function revalidateScreeningPaths(relationshipId: string): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/screenings`);
}

export async function submitScreeningAction(
  _previousState: ScreeningActionState,
  formData: FormData,
): Promise<ScreeningActionState> {
  const rawInput = buildSubmissionInput(formData);
  const parsed = screeningSubmitRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตอบคำถามทุกข้อ ตรวจสอบคะแนน และลองส่งอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const input: NormalizedScreeningSubmitRequest = parsed.data;
    const result = await submitScreening(actor, input);
    revalidateScreeningPaths(input.patientHospitalRelationshipId);

    return {
      status: "SUCCESS",
      result: {
        screeningAssessmentId: result.screeningAssessmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        submittedAt: result.submittedAt.toISOString(),
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapScreeningError(error) };
  }
}
