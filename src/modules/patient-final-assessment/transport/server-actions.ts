"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";

import {
  patientFinalAssessmentCreateRequestSchema,
} from "../schemas/patient-final-assessment-schemas";
import { createPatientFinalAssessment } from "../services/patient-final-assessment-service";

import type { PatientFinalAssessmentActionState } from "./action-state";
import {
  buildCreateInput,
  mapPatientFinalAssessmentError,
} from "./server-action-helpers";

function revalidateFinalAssessmentPaths(
  relationshipId: string,
  programId: string,
): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/programs/${programId}`);
}

export async function createPatientFinalAssessmentAction(
  _previousState: PatientFinalAssessmentActionState,
  formData: FormData,
): Promise<PatientFinalAssessmentActionState> {
  const parsed = patientFinalAssessmentCreateRequestSchema.safeParse(buildCreateInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบแบบฟอร์ม Final Assessment และกรอกข้อมูลอย่างน้อย 1 รายการก่อนบันทึก",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await createPatientFinalAssessment(actor, parsed.data);
    revalidateFinalAssessmentPaths(
      result.patientHospitalRelationshipId,
      result.patientProgramId,
    );

    return {
      status: "SUCCESS",
      result: {
        patientFinalAssessmentId: result.patientFinalAssessmentId,
        patientProgramId: result.patientProgramId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapPatientFinalAssessmentError(error) };
  }
}
