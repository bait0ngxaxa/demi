"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import { ApplicationError } from "@/shared/errors/application-error";
import {
  getPatientSelfLoginHref,
  PATIENT_SELF_SESSION_EXPIRED_MESSAGE,
} from "@/modules/patient-self/transport/patient-self-session";
import { createPersonalMedication, updatePersonalMedication, stopPersonalMedication, replacePersonalMedicationSchedules } from "../services/personal-medication-service";
import { personalMedicationCreateSchema, personalMedicationUpdateSchema, personalMedicationStopSchema, personalMedicationScheduleSchema } from "../schemas/personal-medication-schemas";
import { parseMedicationCreateForm, parseMedicationScheduleForm } from "./schedule-form";
import type { PersonalMedicationActionState } from "./action-state";

async function performAction(formData: FormData, operation: "create" | "update" | "stop" | "schedule"): Promise<PersonalMedicationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    // Retain unknown fields for strict rejection, rather than silently dropping authority fields.
    const entries = Array.from(formData.entries()).filter(([key]) => !key.startsWith("$ACTION_"));
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      return { status: "ERROR", message: "ข้อมูลซ้ำ กรุณาตรวจสอบแบบฟอร์ม" };
    }
    const input = operation === "create" ? parseMedicationCreateForm(formData)
      : operation === "schedule" ? parseMedicationScheduleForm(formData) : Object.fromEntries(entries);
    const schema = operation === "create" ? personalMedicationCreateSchema : operation === "update" ? personalMedicationUpdateSchema : operation === "schedule" ? personalMedicationScheduleSchema : personalMedicationStopSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: PersonalMedicationActionState["fieldErrors"] = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "medicationName") fieldErrors.medicationName = "กรุณาระบุชื่อยาไม่เกิน 200 ตัวอักษร";
        if (issue.path[0] === "instructionText") fieldErrors.instructionText = "กรุณาระบุข้อความไม่เกิน 2,000 ตัวอักษร";
        if (issue.path[0] === "times") fieldErrors.times = "กรุณาระบุเวลา HH:mm ระดับนาทีให้ครบและไม่ซ้ำกัน";
      }
      return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors };
    }
    // Service validates the raw values again inside its transaction.
    const item = operation === "create" ? await createPersonalMedication(actor, input)
      : operation === "update" ? await updatePersonalMedication(actor, input)
        : operation === "schedule" ? await replacePersonalMedicationSchedules(actor, input) : await stopPersonalMedication(actor, input);
    revalidatePath("/app/personal/medications");
    return { status: "SUCCESS", message: operation === "stop" ? "หยุดติดตามรายการนี้ใน DEMI แล้ว" : operation === "schedule" ? "บันทึกเวลาแล้ว" : "บันทึกรายการแล้ว", item };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      if (error.code === "CONFLICT") return { status: "CONFLICT", message: "รายการเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนดำเนินการต่อ" };
      if (error.code === "NOT_FOUND") return { status: "ERROR", message: "ไม่พบรายการที่ต้องการ" };
      if (error.code === "UNAUTHENTICATED") {
        return {
          status: "ERROR",
          message: PATIENT_SELF_SESSION_EXPIRED_MESSAGE,
          loginHref: getPatientSelfLoginHref(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_MEDICATIONS),
        };
      }
      if (error.code === "FORBIDDEN") return { status: "ERROR", message: "บัญชีนี้ไม่สามารถเข้าถึงรายการได้" };
      if (error.code === "VALIDATION") return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลที่กรอก" };
    }
    return { status: "ERROR", message: "ยังยืนยันการบันทึกไม่ได้ กรุณาโหลดรายการล่าสุดเพื่อตรวจสอบก่อนส่งอีกครั้ง", refreshRequired: true };
  }
}

export async function createPersonalMedicationAction(_previous: PersonalMedicationActionState, formData: FormData): Promise<PersonalMedicationActionState> {
  return performAction(formData, "create");
}
export async function updatePersonalMedicationAction(_previous: PersonalMedicationActionState, formData: FormData): Promise<PersonalMedicationActionState> {
  return performAction(formData, "update");
}
export async function stopPersonalMedicationAction(_previous: PersonalMedicationActionState, formData: FormData): Promise<PersonalMedicationActionState> {
  return performAction(formData, "stop");
}
export async function replacePersonalMedicationSchedulesAction(_previous: PersonalMedicationActionState, formData: FormData): Promise<PersonalMedicationActionState> {
  return performAction(formData, "schedule");
}
