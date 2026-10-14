"use server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { setOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { setOwnMedicationLineReminderPreference } from "@/modules/medications/services/medication-line-reminder-preference-service";
import { ApplicationError, ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/application-error";
import { updateOwnContactEmail } from "../services/contact-setting-service";

export type ContactEmailActionState = { status: "IDLE" } | { status: "SUCCESS"; email: string | null; version: number } | { status: "ERROR"; message: string; code: "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE" };

export async function saveOwnContactEmailAction(input: unknown): Promise<ContactEmailActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const updated = await updateOwnContactEmail(actor, input);
    return { status: "SUCCESS", ...updated };
  } catch (error: unknown) {
    if (error instanceof ValidationError) return { status: "ERROR", code: "VALIDATION", message: "กรุณาตรวจสอบรูปแบบอีเมลและโหลดรุ่นล่าสุด" };
    if (error instanceof ConflictError) return { status: "ERROR", code: "CONFLICT", message: "ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาโหลดการตั้งค่าล่าสุด" };
    if (error instanceof ForbiddenError || error instanceof ApplicationError && error.code === "UNAUTHENTICATED") return { status: "ERROR", code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์แก้ไขการตั้งค่า" };
    return { status: "ERROR", code: "UNAVAILABLE", message: "บันทึกข้อมูลติดต่อไม่สำเร็จ กรุณาลองใหม่" };
  }
}

export async function setAppointmentLineNotificationsAction(enabled: boolean): Promise<{ status: "SUCCESS"; enabled: boolean } | { status: "ERROR"; message: string }> {
  if (typeof enabled !== "boolean") return { status: "ERROR", message: "ข้อมูลการแจ้งเตือนไม่ถูกต้อง" };
  try { const actor = await getProtectedApplicationActor(); const preference = await setOwnAppointmentLineNotificationPreference(actor, enabled); return { status: "SUCCESS", enabled: preference.enabled }; }
  catch { return { status: "ERROR", message: "บันทึกการแจ้งเตือนนัดหมายไม่สำเร็จ กรุณาตรวจสอบการเชื่อม LINE" }; }
}

export async function setMedicationLineRemindersAction(enabled: boolean): Promise<{ status: "SUCCESS"; enabled: boolean } | { status: "ERROR"; message: string }> {
  if (typeof enabled !== "boolean") return { status: "ERROR", message: "ข้อมูลการแจ้งเตือนไม่ถูกต้อง" };
  try { const actor = await getProtectedApplicationActor(); const preference = await setOwnMedicationLineReminderPreference(actor, enabled); return { status: "SUCCESS", enabled: preference.enabled }; }
  catch { return { status: "ERROR", message: "บันทึกการแจ้งเตือนยาไม่สำเร็จ กรุณาตรวจสอบการเชื่อม LINE" }; }
}
