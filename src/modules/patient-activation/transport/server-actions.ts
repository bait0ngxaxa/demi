"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  patientActivationCompletionSchema,
  patientActivationRequestSchema,
} from "../schemas/patient-activation-schemas";
import {
  completePatientActivation,
  getPatientActivationDetails,
  issuePatientActivation,
} from "../services/patient-activation-service";
import type {
  PatientActivationCompletionActionState,
  PatientActivationDetailsActionState,
  PatientActivationIssueActionState,
  PatientActivationIssueResultState,
} from "./action-state";

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function mapIssueError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { code: "INVALID_INPUT", message: "ไม่สามารถออกลิงก์เปิดใช้งานได้" };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์ออกลิงก์เปิดใช้งานผู้ป่วยในโรงพยาบาลนี้",
      };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message: "ไม่สามารถออกลิงก์เปิดใช้งานให้ผู้ป่วยรายนี้ได้ กรุณาตรวจสอบสถานะแล้วลองใหม่",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมออกลิงก์เปิดใช้งานในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function mapCompletionError(error: unknown): {
  code: "INVALID_INPUT" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { code: "INVALID_INPUT", message: "กรุณาตรวจสอบรหัสผ่านให้ถูกต้อง" };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message: "ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบยังไม่สามารถเปิดใช้งานบัญชีได้ กรุณาลองใหม่หรือติดต่อโรงพยาบาล",
  };
}

function toIssueResultState(
  result: Awaited<ReturnType<typeof issuePatientActivation>>,
): PatientActivationIssueResultState {
  return {
    outcome: result.outcome,
    userId: result.userId,
    patientProfileId: result.patientProfileId,
    hospitalId: result.hospitalId,
    activationToken: result.activationToken,
    activationExpiresAt: result.activationExpiresAt?.toISOString() ?? null,
  };
}

export async function issuePatientActivationAction(
  _previousState: PatientActivationIssueActionState,
  formData: FormData,
): Promise<PatientActivationIssueActionState> {
  const reissueValue = getString(formData, "reissue");
  const parsed = patientActivationRequestSchema.safeParse({
    userId: getString(formData, "userId"),
    targetHospitalId: getString(formData, "targetHospitalId"),
    reissue:
      reissueValue === "true" ? true : reissueValue === "false" ? false : undefined,
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่สามารถออกลิงก์เปิดใช้งานได้",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await issuePatientActivation(actor, parsed.data);
    revalidatePath("/app/patients/provision");
    return { status: "SUCCESS", result: toIssueResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapIssueError(error) };
  }
}

export async function getPatientActivationDetailsAction(
  token: string,
): Promise<PatientActivationDetailsActionState> {
  try {
    const result = await getPatientActivationDetails(token);
    return {
      status: "AVAILABLE",
      displayName: result.displayName,
      hospitalName: result.hospitalName,
      activationExpiresAt: result.activationExpiresAt.toISOString(),
    };
  } catch {
    return {
      status: "INVALID",
      message: "ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ",
    };
  }
}

function getCompletionInput(formData: FormData) {
  return {
    password: getString(formData, "password"),
    passwordConfirmation: getString(formData, "passwordConfirmation"),
  };
}

export async function completePatientActivationAction(
  token: string,
  _previousState: PatientActivationCompletionActionState,
  formData: FormData,
): Promise<PatientActivationCompletionActionState> {
  const parsed = patientActivationCompletionSchema.safeParse(getCompletionInput(formData));

  if (!parsed.success) {
    const fieldErrors: { password?: string; passwordConfirmation?: string } = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0];

      if (field === "password" && !fieldErrors.password) {
        fieldErrors.password = "รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร";
      }

      if (field === "passwordConfirmation" && !fieldErrors.passwordConfirmation) {
        fieldErrors.passwordConfirmation = "กรุณายืนยันรหัสผ่านให้ตรงกัน";
      }
    }

    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบรหัสผ่านให้ถูกต้อง",
      fieldErrors,
    };
  }

  try {
    await completePatientActivation(token, parsed.data);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapCompletionError(error) };
  }

  redirect("/login?activated=1");
}
