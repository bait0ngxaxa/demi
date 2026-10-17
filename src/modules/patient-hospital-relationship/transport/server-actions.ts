"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import {
  endPatientHospitalRelationship,
  getPatientHospitalRelationshipEndStatus,
  type PatientHospitalRelationshipEndStatus,
} from "../services/patient-hospital-relationship-end-service";

/**
 * `code` classifies an ERROR so the UI never compares message text. UNAVAILABLE covers every
 * unexpected failure and is not proof that the end did not commit. Success never returns:
 * it redirects to the Patient list.
 */
export type PatientHospitalRelationshipEndErrorCode = "INVALID_INPUT" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE";
export type PatientHospitalRelationshipEndActionState = {
  status: "IDLE" | "ERROR";
  message: string;
  code?: PatientHospitalRelationshipEndErrorCode;
};
export type PatientHospitalRelationshipEndVerification = PatientHospitalRelationshipEndStatus | "UNRESOLVED";

/** Phase F recovery: read the relationship lifecycle without replaying the end operation or exposing patient data. */
export async function verifyPatientHospitalRelationshipEndAction(
  relationshipId: string,
): Promise<PatientHospitalRelationshipEndVerification> {
  try {
    const actor = await getProtectedApplicationActor();
    return await getPatientHospitalRelationshipEndStatus(actor, relationshipId);
  } catch {
    return "UNRESOLVED";
  }
}

/** Phase F (ก-18): OWNER ends this Patient's care with the Hospital; on success the Patient leaves the work lists. */
export async function endPatientHospitalRelationshipAction(
  relationshipId: string,
  _state: PatientHospitalRelationshipEndActionState,
  formData: FormData,
): Promise<PatientHospitalRelationshipEndActionState> {
  let hospitalId: string;
  try {
    const actor = await getProtectedApplicationActor();
    const result = await endPatientHospitalRelationship(actor, {
      relationshipId,
      endReason: formData.get("endReason"),
      confirmRetention: formData.get("confirmRetention") === "true",
    });
    hospitalId = result.hospitalId;
  } catch (error: unknown) {
    return error instanceof ValidationError
      ? { status: "ERROR", code: "INVALID_INPUT", message: "กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร) และยืนยันว่าเข้าใจผลของการสิ้นสุดการดูแล" }
      : error instanceof ConflictError
        ? { status: "ERROR", code: "CONFLICT", message: "สถานะผู้ป่วยเปลี่ยนแปลงแล้วหรือสิ้นสุดการดูแลไปแล้ว กรุณาโหลดหน้าใหม่" }
        : error instanceof ForbiddenError || error instanceof NotFoundError
          ? { status: "ERROR", code: "FORBIDDEN", message: "เฉพาะเจ้าของโรงพยาบาลนี้ที่สิ้นสุดการดูแลผู้ป่วยได้" }
          : { status: "ERROR", code: "UNAVAILABLE", message: "บันทึกไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }

  revalidatePath("/app/patients", "layout");
  revalidatePath("/app/personal", "layout");
  revalidatePath("/app/hospitals/reporting");
  redirect(`/app/patients?hospitalId=${encodeURIComponent(hospitalId)}`);
}
