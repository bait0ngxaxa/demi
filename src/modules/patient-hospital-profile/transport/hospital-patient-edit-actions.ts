"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ValidationError } from "@/shared/errors/application-error";

import { updatePatientHealthHistory } from "../services/patient-health-history-service";
import { updateStaffPatientHospitalProfile } from "../services/patient-hospital-profile-service";

export type HospitalPatientEditState = { status: "IDLE" | "SUCCESS" | "ERROR"; message: string };

async function save(relationshipId: string, formData: FormData, health: boolean): Promise<HospitalPatientEditState> {
  try {
    const actor = await getProtectedApplicationActor();
    const input = Object.fromEntries(formData.entries());
    if (health) {
      await updatePatientHealthHistory(actor, relationshipId, { ...input,
        diagnosisYear: input.diagnosisYear ? Number(input.diagnosisYear) : null,
        otherConditions: input.otherConditions || null,
      });
    } else {
      await updateStaffPatientHospitalProfile(actor, relationshipId, input);
    }
    revalidatePath(`/app/patients/${relationshipId}`, "layout");
    revalidatePath("/app/personal", "layout");
    revalidatePath("/app/hospitals/reporting");
    return { status: "SUCCESS", message: "บันทึกข้อมูลสำหรับโรงพยาบาลนี้แล้ว" };
  } catch (error: unknown) {
    return { status: "ERROR", message: error instanceof ConflictError
      ? "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก"
      : error instanceof ValidationError ? "กรุณาตรวจสอบข้อมูลและปี พ.ศ. ที่กรอก"
        : "บันทึกไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง" };
  }
}

export async function savePatientHealthHistoryAction(relationshipId: string, _state: HospitalPatientEditState, formData: FormData): Promise<HospitalPatientEditState> {
  return save(relationshipId, formData, true);
}

export async function saveStaffPatientHospitalProfileAction(relationshipId: string, _state: HospitalPatientEditState, formData: FormData): Promise<HospitalPatientEditState> {
  return save(relationshipId, formData, false);
}
