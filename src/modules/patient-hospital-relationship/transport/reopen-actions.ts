"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  PatientHospitalRelationshipReopenHospitalInactiveError,
  previewPatientHospitalRelationshipReopen,
  reopenPatientHospitalRelationship,
} from "../services/patient-hospital-relationship-reopen-service";

/**
 * ADR-0032 admin reopen. `code` classifies an ERROR so the UI never compares message text. UNAVAILABLE after a
 * reopen submit is not proof that nothing committed: the admin looks the Patient up again to see the current state.
 */
export type PatientCareReopenErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "HOSPITAL_INACTIVE"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAVAILABLE";

export type PatientCareReopenPreviewState =
  | { status: "IDLE" }
  | { status: "FOUND"; maskedName: string; endedAt: string }
  | { status: "ERROR"; code: PatientCareReopenErrorCode; message: string };

export type PatientCareReopenState =
  | { status: "IDLE" }
  | { status: "REOPENED"; message: string; activationLinkRequired: boolean }
  | { status: "ERROR"; code: PatientCareReopenErrorCode; message: string };

function toErrorState(error: unknown, unavailableMessage: string): { status: "ERROR"; code: PatientCareReopenErrorCode; message: string } {
  if (error instanceof ValidationError) {
    return { status: "ERROR", code: "INVALID_INPUT", message: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง และระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)" };
  }
  if (error instanceof NotFoundError) {
    return { status: "ERROR", code: "NOT_FOUND", message: "ไม่พบการดูแลที่สิ้นสุดแล้วของเลขบัตรประชาชนนี้ในโรงพยาบาลนี้" };
  }
  if (error instanceof PatientHospitalRelationshipReopenHospitalInactiveError) {
    return { status: "ERROR", code: "HOSPITAL_INACTIVE", message: "โรงพยาบาลนี้ไม่ได้อยู่ในสถานะใช้งาน จึงเปิดการดูแลกลับไม่ได้" };
  }
  if (error instanceof ConflictError) {
    return { status: "ERROR", code: "CONFLICT", message: "ข้อมูลการดูแลเปลี่ยนแปลงแล้ว กรุณาค้นหาผู้ป่วยอีกครั้ง" };
  }
  if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
    return { status: "ERROR", code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบ DEMI ที่เปิดการดูแลกลับได้" };
  }
  return { status: "ERROR", code: "UNAVAILABLE", message: unavailableMessage };
}

/** Confirmation step: the masked name and end time, so the ADMIN confirms the right Patient before reopening. */
export async function previewPatientCareReopenAction(
  hospitalId: string,
  _state: PatientCareReopenPreviewState,
  formData: FormData,
): Promise<PatientCareReopenPreviewState> {
  try {
    const actor = await getProtectedApplicationActor();
    const preview = await previewPatientHospitalRelationshipReopen(actor, {
      hospitalId,
      nationalId: formData.get("nationalId"),
    });
    return { status: "FOUND", maskedName: preview.maskedName, endedAt: preview.endedAt.toISOString() };
  } catch (error: unknown) {
    return toErrorState(error, "ค้นหาไม่ได้ กรุณาลองใหม่อีกครั้ง");
  }
}

export async function reopenPatientCareAction(
  hospitalId: string,
  _state: PatientCareReopenState,
  formData: FormData,
): Promise<PatientCareReopenState> {
  try {
    const actor = await getProtectedApplicationActor();
    const result = await reopenPatientHospitalRelationship(actor, {
      hospitalId,
      nationalId: formData.get("nationalId"),
      reopenReason: formData.get("reopenReason"),
      expectedEndedAt: formData.get("expectedEndedAt"),
    });
    revalidatePath("/app/patients", "layout");
    revalidatePath(`/app/admin/hospitals/${result.hospitalId}`);
    return {
      status: "REOPENED",
      activationLinkRequired: result.activationLinkRequired,
      message: result.activationLinkRequired
        ? `เปิดการดูแลผู้ป่วย ${result.maskedName} กับโรงพยาบาลนี้อีกครั้งแล้ว ผู้ป่วยยังไม่มีบัญชีที่ใช้งานได้และลงทะเบียนเองไม่ได้ โรงพยาบาลต้องออกลิงก์เปิดใช้งานให้`
        : `เปิดการดูแลผู้ป่วย ${result.maskedName} กับโรงพยาบาลนี้อีกครั้งแล้ว`,
    };
  } catch (error: unknown) {
    return toErrorState(error, "ยังยืนยันผลไม่ได้ กรุณาค้นหาผู้ป่วยอีกครั้งเพื่อตรวจสอบสถานะก่อนลองใหม่");
  }
}
