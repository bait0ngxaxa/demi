"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ValidationError } from "@/shared/errors/application-error";
import { submitAppointmentRescheduleRequest, rejectAppointmentRescheduleRequest } from "../services/appointment-service";

export type RescheduleRequestActionState = { message: string; status: "IDLE" | "SUCCESS" | "ERROR" };

export async function submitRescheduleRequestAction(_state: RescheduleRequestActionState, form: FormData): Promise<RescheduleRequestActionState> {
  return run(form, false);
}

export async function rejectRescheduleRequestAction(_state: RescheduleRequestActionState, form: FormData): Promise<RescheduleRequestActionState> {
  return run(form, true);
}

async function run(form: FormData, reject: boolean): Promise<RescheduleRequestActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const input = { patientHospitalRelationshipId: form.get("patientHospitalRelationshipId"), appointmentId: form.get("appointmentId") };
    const result = reject ? await rejectAppointmentRescheduleRequest(actor, { ...input, requestId: form.get("requestId"), rejectionReason: form.get("rejectionReason") })
      : await submitAppointmentRescheduleRequest(actor, { ...input, expectedUpdatedAt: form.get("expectedUpdatedAt"), submissionNonce: form.get("submissionNonce"), reason: form.get("reason"),
        preferredDatetimes: form.getAll("preferredDatetimes").filter((value) => typeof value === "string" && value).map((value) => `${value}:00+07:00`) });
    revalidatePath(`/app/patients/${result.patientHospitalRelationshipId}/appointments`, "layout");
    revalidatePath("/app/personal/appointments", "layout");
    return { status: "SUCCESS", message: reject ? "ปฏิเสธคำขอแล้ว" : "ส่งคำขอเลื่อนนัดแล้ว รอเจ้าหน้าที่พิจารณา" };
  } catch (error: unknown) {
    return { status: "ERROR", message: error instanceof ConflictError ? "นัดหมายเปลี่ยนแปลงหรือมีคำขอค้างอยู่แล้ว กรุณาโหลดหน้าใหม่"
      : error instanceof ValidationError ? "กรุณาเลือกวันเวลาในอนาคตไม่เกิน 366 วัน พร้อมเหตุผลไม่เกิน 500 ตัวอักษร"
        : "ดำเนินการไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง" };
  }
}
