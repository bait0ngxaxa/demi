"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";

import {
  followupCreateRequestSchema,
  followupProgramCreateRequestSchema,
} from "../schemas/followup-schemas";
import { createFollowup, createFollowupForProgram } from "../services/followup-service";

import type { FollowupActionState } from "./action-state";
import {
  buildProgramSubmissionInput,
  buildSubmissionInput,
  mapFollowupError,
} from "./server-action-helpers";

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
      message: "กรุณาตรวจสอบข้อมูลการติดตามผลก่อนส่งอีกครั้ง",
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

export async function createFollowupForProgramAction(
  _previousState: FollowupActionState,
  formData: FormData,
): Promise<FollowupActionState> {
  const rawInput = buildProgramSubmissionInput(formData);
  const parsed = followupProgramCreateRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลการติดตามผลก่อนส่งอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await createFollowupForProgram(actor, parsed.data);
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
