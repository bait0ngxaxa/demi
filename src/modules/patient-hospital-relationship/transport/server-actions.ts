"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { endPatientHospitalRelationship } from "../services/patient-hospital-relationship-end-service";

export type PatientHospitalRelationshipEndActionState = { status: "IDLE" | "ERROR"; message: string };

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
    return {
      status: "ERROR",
      message: error instanceof ValidationError
        ? "กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร) และยืนยันว่าเข้าใจผลของการสิ้นสุดการดูแล"
        : error instanceof ConflictError
          ? "สถานะผู้ป่วยเปลี่ยนแปลงแล้วหรือสิ้นสุดการดูแลไปแล้ว กรุณาโหลดหน้าใหม่"
          : error instanceof ForbiddenError || error instanceof NotFoundError
            ? "เฉพาะเจ้าของโรงพยาบาลนี้ที่สิ้นสุดการดูแลผู้ป่วยได้"
            : "บันทึกไม่ได้ กรุณาลองใหม่อีกครั้ง",
    };
  }

  revalidatePath("/app/patients", "layout");
  revalidatePath("/app/personal", "layout");
  revalidatePath("/app/hospitals/reporting");
  redirect(`/app/patients?hospitalId=${encodeURIComponent(hospitalId)}`);
}
