"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { roundConflictMessage } from "@/modules/patient-program-rounds/domain/round-conflict-error";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  CURRENT_INSTRUMENT_QUESTION_SETS,
  type InstrumentQuestionSet,
} from "../domain/question-sets";
import {
  screeningInstrumentSchema,
  screeningSubmitRequestSchema,
  type ScreeningSubmitRequest,
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


function getAnswerValue(formData: FormData, key: string): unknown {
  const value = getSingleString(formData, key);

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return Number(value);
}

function buildAnswerMap(formData: FormData, questionSet: InstrumentQuestionSet): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (const question of questionSet.questions) {
    answers[question.key] = getAnswerValue(formData, question.key);
  }

  return answers;
}

function containsUnexpectedFields(formData: FormData, questionSet: InstrumentQuestionSet): boolean {
  const allowedFields = new Set([
    "patientHospitalRelationshipId",
    "patientProgramId",
    "submissionNonce",
    "instrument",
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
  const instrument = screeningInstrumentSchema.safeParse(getSingleString(formData, "instrument"));

  if (!instrument.success) {
    return null;
  }

  const questionSet = CURRENT_INSTRUMENT_QUESTION_SETS[instrument.data];

  if (containsUnexpectedFields(formData, questionSet)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    patientProgramId: getSingleString(formData, "patientProgramId"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    instrument: instrument.data,
    responses: { answers: buildAnswerMap(formData, questionSet) },
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
        message: "กรุณาตอบคำถามทุกข้อ แล้วลองส่งอีกครั้ง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์ทำแบบประเมินสำหรับผู้ป่วยรายนี้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message:
          roundConflictMessage(error) ??
          "การบันทึกแบบประเมินนี้เสร็จสิ้นแล้ว หรือข้อมูลเปลี่ยนแปลง กรุณาเปิดประวัติอีกครั้ง",
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
    message: "ระบบไม่พร้อมบันทึกแบบประเมินในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function revalidateScreeningPaths(relationshipId: string): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/screenings`);
}

function revalidateProgramRoundPaths(relationshipId: string, programId: string): void {
  revalidatePath(`/app/patients/${relationshipId}/programs/${programId}`);
  revalidatePath(`/app/patients/${relationshipId}/programs/${programId}/rounds`, "layout");
  revalidatePath(`/app/personal/care/${relationshipId}/programs/${programId}`, "layout");
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
      message: "กรุณาตอบคำถามทุกข้อ แล้วลองส่งอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const input: ScreeningSubmitRequest = parsed.data;
    const result = await submitScreening(actor, input);
    revalidateScreeningPaths(input.patientHospitalRelationshipId);

    if (input.patientProgramId) {
      revalidateProgramRoundPaths(input.patientHospitalRelationshipId, input.patientProgramId);
    }

    return {
      status: "SUCCESS",
      result: {
        screeningAssessmentId: result.screeningAssessmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        instrument: result.instrument,
        submittedAt: result.submittedAt.toISOString(),
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapScreeningError(error) };
  }
}
