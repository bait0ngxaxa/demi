"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  ConflictError,
  ValidationError,
} from "@/shared/errors/application-error";

import { updateOwnPatientHospitalProfile } from "../services/patient-hospital-profile-service";
import type { PatientHospitalProfileUpdateActionState } from "./action-state";

export async function updateOwnPatientHospitalProfileAction(
  relationshipId: string,
  _previousState: PatientHospitalProfileUpdateActionState,
  formData: FormData,
): Promise<PatientHospitalProfileUpdateActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await updateOwnPatientHospitalProfile(
      actor,
      relationshipId,
      Object.fromEntries(formData.entries()),
    );
    revalidatePath(`/app/personal/profile/${relationshipId}`);
    revalidatePath("/app/personal/profile");

    return {
      status: "SUCCESS",
      message: "บันทึกข้อมูลสำหรับโรงพยาบาลนี้แล้ว",
    };
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return {
        status: "ERROR",
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบข้อมูลที่กรอกและลองอีกครั้ง",
      };
    }

    if (error instanceof ConflictError) {
      return {
        status: "ERROR",
        code: "CONFLICT",
        message: "ข้อมูลเปลี่ยนแปลงหลังจากเปิดหน้านี้ กรุณาโหลดหน้าใหม่และตรวจสอบค่าปัจจุบันก่อนบันทึก",
      };
    }

    return {
      status: "ERROR",
      code: "UNAVAILABLE",
      message: "ยังบันทึกข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง",
    };
  }
}
