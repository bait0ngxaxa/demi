"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/application-error";

import { updatePatientHealthHistory } from "../services/patient-health-history-service";
import { updateStaffPatientHospitalProfile } from "../services/patient-hospital-profile-service";
import { correctPatientName, PatientNameCorrectionRequiresAdminError } from "../services/patient-name-correction-service";

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

/** Customer decision E3 (ก-19): OWNER (single-hospital Person) or ADMIN corrects the Person name. */
export async function correctPatientNameAction(relationshipId: string, _state: HospitalPatientEditState, formData: FormData): Promise<HospitalPatientEditState> {
  try {
    const actor = await getProtectedApplicationActor();
    await correctPatientName(actor, relationshipId, {
      expectedVersion: formData.get("expectedVersion"),
      givenName: formData.get("givenName"),
      familyName: formData.get("familyName"),
    });
    revalidatePath(`/app/patients/${relationshipId}`, "layout");
    revalidatePath("/app/personal", "layout");
    revalidatePath("/app/admin/hospitals", "layout");
    return { status: "SUCCESS", message: "แก้ไขชื่อ-สกุลแล้ว" };
  } catch (error: unknown) {
    return { status: "ERROR", message: error instanceof PatientNameCorrectionRequiresAdminError
      ? "ผู้ป่วยรายนี้เชื่อมกับหลายโรงพยาบาล กรุณาติดต่อผู้ดูแลระบบ"
      : error instanceof ConflictError ? "ชื่อ-สกุลเปลี่ยนแปลงแล้วหรือไม่ได้แก้ไข กรุณาโหลดหน้าใหม่ก่อนบันทึก"
        : error instanceof ValidationError ? "กรุณากรอกชื่อและนามสกุล (ไม่เกิน 120 ตัวอักษร)"
          : error instanceof ForbiddenError ? "บัญชีนี้ไม่มีสิทธิ์แก้ไขชื่อ-สกุลผู้ป่วยรายนี้"
            : "บันทึกไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }
}

export async function saveStaffPatientHospitalProfileAction(relationshipId: string, _state: HospitalPatientEditState, formData: FormData): Promise<HospitalPatientEditState> {
  return save(relationshipId, formData, false);
}
