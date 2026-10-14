"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";

import {
  roundReviewRequestSchema,
  roundVitalsRequestSchema,
} from "../schemas/round-schemas";
import {
  recordPatientProgramRoundReview,
  recordPatientProgramRoundVitals,
} from "../services/round-service";

import type { PatientProgramRoundActionState } from "./action-state";
import {
  buildReviewInput,
  buildVitalsInput,
  mapPatientProgramRoundError,
} from "./server-action-helpers";

function revalidateRoundPaths(relationshipId: string, programId: string): void {
  revalidatePath(`/app/patients/${relationshipId}/programs/${programId}`);
  revalidatePath(`/app/patients/${relationshipId}/programs/${programId}/rounds`, "layout");
}

export async function recordPatientProgramRoundVitalsAction(
  _previousState: PatientProgramRoundActionState,
  formData: FormData,
): Promise<PatientProgramRoundActionState> {
  const parsed = roundVitalsRequestSchema.safeParse(buildVitalsInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบแบบฟอร์มสัญญาณชีพ และกรอกค่าอย่างน้อย 1 รายการก่อนบันทึก",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await recordPatientProgramRoundVitals(actor, parsed.data);
    revalidateRoundPaths(result.patientHospitalRelationshipId, result.patientProgramId);

    return {
      status: "SUCCESS",
      result: {
        operation: result.operation,
        patientProgramId: result.patientProgramId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        roundNumber: result.roundNumber,
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapPatientProgramRoundError(error) };
  }
}

export async function recordPatientProgramRoundReviewAction(
  _previousState: PatientProgramRoundActionState,
  formData: FormData,
): Promise<PatientProgramRoundActionState> {
  const parsed = roundReviewRequestSchema.safeParse(buildReviewInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่สามารถบันทึกการทบทวนได้ กรุณาลองใหม่อีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await recordPatientProgramRoundReview(actor, parsed.data);
    revalidateRoundPaths(result.patientHospitalRelationshipId, result.patientProgramId);

    return {
      status: "SUCCESS",
      result: {
        operation: result.operation,
        patientProgramId: result.patientProgramId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        roundNumber: result.roundNumber,
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapPatientProgramRoundError(error) };
  }
}
