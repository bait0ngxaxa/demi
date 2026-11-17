"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { roundConflictMessage } from "@/modules/patient-program-rounds/domain/round-conflict-error";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  goalPlanProgramSubmitRequestSchema,
  goalPlanSubmitRequestSchema,
} from "../schemas/goal-schemas";
import { createGoalPlan, createGoalPlanForProgram } from "../services/goal-service";

import type { GoalPlanActionState } from "./action-state";
import { buildProgramSubmissionInput, buildSubmissionInput } from "./goal-plan-form-input";

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
        message: "บัญชีนี้ไม่มีสิทธิ์สร้างแผนสุขภาพให้ผู้ป่วยรายนี้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message:
          roundConflictMessage(error) ??
          "บันทึกแผนสุขภาพนี้แล้ว หรือข้อมูลเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุด",
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
    message: "ระบบไม่พร้อมบันทึกแผนสุขภาพในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function revalidateGoalPlanPaths(
  relationshipId: string,
  goalPlanId: string,
  patientProgramId?: string | null,
): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/goals`);
  revalidatePath(`/app/patients/${relationshipId}/goals/${goalPlanId}`);

  if (patientProgramId) {
    const programPath = `/app/patients/${relationshipId}/programs/${patientProgramId}`;
    revalidatePath(programPath);
    revalidatePath(`${programPath}/goals`);
    revalidatePath(`${programPath}/goals/${goalPlanId}`);
  }
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

export async function submitGoalPlanForProgramAction(
  _previousState: GoalPlanActionState,
  formData: FormData,
): Promise<GoalPlanActionState> {
  const rawInput = buildProgramSubmissionInput(formData);
  const parsed = goalPlanProgramSubmitRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบเป้าหมาย กิจกรรม และค่าเป้าหมายก่อนบันทึกอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await createGoalPlanForProgram(actor, parsed.data);
    revalidateGoalPlanPaths(
      result.patientHospitalRelationshipId,
      result.goalPlanId,
      result.patientProgramId,
    );

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
