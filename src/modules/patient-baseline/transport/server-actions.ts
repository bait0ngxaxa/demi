"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";

import {
  patientBaselineCreateRequestSchema,
  patientBaselineUpdateRequestSchema,
} from "../schemas/patient-baseline-schemas";
import { createPatientBaseline, updatePatientBaseline } from "../services/patient-baseline-service";

import type { PatientBaselineActionState } from "./action-state";
import {
  buildSubmissionInput,
  buildUpdateSubmissionInput,
  mapPatientBaselineError,
  mapPatientBaselineUpdateError,
} from "./server-action-helpers";

function revalidatePatientBaselinePaths(relationshipId: string): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/baseline`);
}

export async function createPatientBaselineAction(
  _previousState: PatientBaselineActionState,
  formData: FormData,
): Promise<PatientBaselineActionState> {
  const rawInput = buildSubmissionInput(formData);
  const parsed = patientBaselineCreateRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบวันที่และข้อมูลตั้งต้นก่อนบันทึกอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await createPatientBaseline(actor, parsed.data);
    revalidatePatientBaselinePaths(result.patientHospitalRelationshipId);

    return {
      status: "SUCCESS",
      result: {
        patientBaselineId: result.patientBaselineId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        recordedOn: result.recordedOn.toISOString().slice(0, 10),
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapPatientBaselineError(error) };
  }
}

/** Edits the Baseline until a Program links it; the service enforces the lock and the version. */
export async function updatePatientBaselineAction(
  _previousState: PatientBaselineActionState,
  formData: FormData,
): Promise<PatientBaselineActionState> {
  const parsed = patientBaselineUpdateRequestSchema.safeParse(buildUpdateSubmissionInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบวันที่และข้อมูลตั้งต้นก่อนบันทึกอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await updatePatientBaseline(actor, parsed.data);
    revalidatePatientBaselinePaths(result.patientHospitalRelationshipId);

    return {
      status: "SUCCESS",
      result: {
        patientBaselineId: result.patientBaselineId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        recordedOn: result.recordedOn.toISOString().slice(0, 10),
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapPatientBaselineUpdateError(error) };
  }
}
