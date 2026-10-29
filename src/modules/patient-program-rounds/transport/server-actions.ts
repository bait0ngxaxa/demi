"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  addRoundPlanItem, removeRoundPlanItem, markCustomItemDone, unmarkCustomItemDone, addProgramRound,
  addRoundPlanItemSchema, changeRoundPlanItemSchema, customItemDoneSchema, addProgramRoundSchema,
} from "../services/round-plan-write-service";

import {
  roundCompletionRequestSchema,
  roundProfileRequestSchema,
  roundReviewRequestSchema,
  roundStepSkipRequestSchema,
  roundStepUnskipRequestSchema,
  roundVitalsRequestSchema,
} from "../schemas/round-schemas";
import {
  completePatientProgramRound,
  recordPatientProgramRoundProfile,
  recordPatientProgramRoundReview,
  recordPatientProgramRoundVitals,
  skipPatientProgramRoundStep,
  unskipPatientProgramRoundStep,
  type PatientProgramRoundWriteResult,
} from "../services/round-service";

import type { PatientProgramRoundActionState } from "./action-state";
import {
  buildCompletionInput,
  buildProfileInput,
  buildReviewInput,
  buildStepSkipInput,
  buildStepUnskipInput,
  buildVitalsInput,
  mapPatientProgramRoundError,
} from "./server-action-helpers";

function revalidateRoundPaths(relationshipId: string, programId: string): void {
  revalidatePath(`/app/patients/${relationshipId}/programs/${programId}`);
  revalidatePath(`/app/patients/${relationshipId}/programs/${programId}/rounds`, "layout");
  revalidatePath(`/app/personal/care/${relationshipId}/programs/${programId}`, "layout");
  revalidatePath("/app/personal/care");
  revalidatePath("/app/personal");
}

async function runRoundAction(
  input: unknown,
  schema: { safeParse: (value: unknown) => { success: boolean } },
  invalidMessage: string,
  write: (actor: ActorContext, input: unknown) => Promise<PatientProgramRoundWriteResult>,
): Promise<PatientProgramRoundActionState> {
  if (!schema.safeParse(input).success) {
    return { status: "ERROR", code: "INVALID_INPUT", message: invalidMessage };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await write(actor, input);
    revalidateRoundPaths(result.patientHospitalRelationshipId, result.patientProgramId);

    return {
      status: "SUCCESS",
      result: {
        operation: result.operation,
        patientProgramId: result.patientProgramId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        roundNumber: result.roundNumber,
        ...(result.done !== undefined ? { done: result.done, skipped: result.skipped, notDone: result.notDone } : {}),
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapPatientProgramRoundError(error) };
  }
}

export async function recordPatientProgramRoundVitalsAction(
  _previousState: PatientProgramRoundActionState,
  formData: FormData,
): Promise<PatientProgramRoundActionState> {
  return runRoundAction(
    buildVitalsInput(formData),
    roundVitalsRequestSchema,
    "กรุณาตรวจสอบแบบฟอร์มสัญญาณชีพ และกรอกค่าอย่างน้อย 1 รายการก่อนบันทึก",
    recordPatientProgramRoundVitals,
  );
}

export async function recordPatientProgramRoundProfileAction(
  _previousState: PatientProgramRoundActionState,
  formData: FormData,
): Promise<PatientProgramRoundActionState> {
  return runRoundAction(
    buildProfileInput(formData),
    roundProfileRequestSchema,
    "กรุณากรอกชื่อที่อยากให้เรียก (ไม่เกิน 100 ตัวอักษร)",
    recordPatientProgramRoundProfile,
  );
}

export async function recordPatientProgramRoundReviewAction(
  _previousState: PatientProgramRoundActionState,
  formData: FormData,
): Promise<PatientProgramRoundActionState> {
  return runRoundAction(
    buildReviewInput(formData),
    roundReviewRequestSchema,
    "ไม่สามารถบันทึกการทบทวนได้ กรุณาลองใหม่อีกครั้ง",
    recordPatientProgramRoundReview,
  );
}

export async function skipPatientProgramRoundStepAction(
  _previousState: PatientProgramRoundActionState,
  formData: FormData,
): Promise<PatientProgramRoundActionState> {
  return runRoundAction(
    buildStepSkipInput(formData),
    roundStepSkipRequestSchema,
    "กรุณาเลือกเหตุผลที่ข้าม และระบุรายละเอียดเมื่อเลือก “อื่น ๆ” (ไม่เกิน 500 ตัวอักษร)",
    skipPatientProgramRoundStep,
  );
}

export async function unskipPatientProgramRoundStepAction(
  _previousState: PatientProgramRoundActionState,
  formData: FormData,
): Promise<PatientProgramRoundActionState> {
  return runRoundAction(
    buildStepUnskipInput(formData),
    roundStepUnskipRequestSchema,
    "ไม่สามารถยกเลิกการข้ามได้ กรุณาลองใหม่อีกครั้ง",
    unskipPatientProgramRoundStep,
  );
}

export async function completePatientProgramRoundAction(
  _previousState: PatientProgramRoundActionState,
  formData: FormData,
): Promise<PatientProgramRoundActionState> {
  return runRoundAction(
    buildCompletionInput(formData),
    roundCompletionRequestSchema,
    "ไม่สามารถจบบริการครั้งนี้ได้ กรุณาลองใหม่อีกครั้ง",
    completePatientProgramRound,
  );
}

export async function addRoundPlanItemAction(_previous: PatientProgramRoundActionState, formData: FormData): Promise<PatientProgramRoundActionState> {
  return runRoundAction({ patientProgramId: formData.get("patientProgramId"), roundNumber: Number(formData.get("roundNumber")), submissionNonce: formData.get("submissionNonce"), stepCode: formData.get("stepCode"), ...(formData.get("stepCode") === "CUSTOM" ? { customTitle: formData.get("customTitle") } : {}) }, addRoundPlanItemSchema, "กรุณาเลือกรายการ หรือระบุชื่อไม่เกิน 120 ตัวอักษร", addRoundPlanItem);
}

export async function removeRoundPlanItemAction(_previous: PatientProgramRoundActionState, formData: FormData): Promise<PatientProgramRoundActionState> {
  return runRoundAction({ patientProgramId: formData.get("patientProgramId"), roundNumber: Number(formData.get("roundNumber")), submissionNonce: formData.get("submissionNonce"), planItemId: formData.get("planItemId") }, changeRoundPlanItemSchema, "ไม่สามารถตัดรายการนี้ออกได้", removeRoundPlanItem);
}

export async function markCustomItemDoneAction(_previous: PatientProgramRoundActionState, formData: FormData): Promise<PatientProgramRoundActionState> {
  return runRoundAction({ patientProgramId: formData.get("patientProgramId"), roundNumber: Number(formData.get("roundNumber")), submissionNonce: formData.get("submissionNonce"), planItemId: formData.get("planItemId"), note: formData.get("note") ?? "" }, customItemDoneSchema, "หมายเหตุต้องไม่เกิน 500 ตัวอักษร", markCustomItemDone);
}

export async function unmarkCustomItemDoneAction(_previous: PatientProgramRoundActionState, formData: FormData): Promise<PatientProgramRoundActionState> {
  return runRoundAction({ patientProgramId: formData.get("patientProgramId"), roundNumber: Number(formData.get("roundNumber")), submissionNonce: formData.get("submissionNonce"), planItemId: formData.get("planItemId") }, changeRoundPlanItemSchema, "ไม่สามารถยกเลิกการทำรายการนี้ได้", unmarkCustomItemDone);
}

export async function addProgramRoundAction(_previous: PatientProgramRoundActionState, formData: FormData): Promise<PatientProgramRoundActionState> {
  return runRoundAction({ patientProgramId: formData.get("patientProgramId"), submissionNonce: formData.get("submissionNonce") }, addProgramRoundSchema, "ไม่สามารถเพิ่มครั้งบริการได้", addProgramRound);
}
