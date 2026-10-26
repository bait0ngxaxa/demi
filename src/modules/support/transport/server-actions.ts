"use server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError, ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/application-error";
import { SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE } from "../domain/support-report-messages";
import { createSupportReport, updateAdminSupportReportStatus } from "../services/support-report-service";
import { SupportReportRateLimitError } from "../services/support-report-service";

export type SupportReportActionState = { status: "IDLE" } | { status: "SUCCESS"; reportId: string } | { status: "ERROR"; code: "VALIDATION" | "RATE_LIMIT" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE"; message: string };

export async function createSupportReportAction(input: unknown): Promise<SupportReportActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const report = await createSupportReport(actor, input);
    return { status: "SUCCESS", reportId: report.id };
  } catch (error: unknown) {
    if (error instanceof ValidationError) return { status: "ERROR", code: "VALIDATION", message: "กรุณาเลือกหมวดหมู่และระบุข้อความไม่เกิน 1,000 ตัวอักษร" };
    if (error instanceof SupportReportRateLimitError) return { status: "ERROR", code: "RATE_LIMIT", message: "ส่งรายงานครบ 5 ครั้งสำหรับวันนี้แล้ว กรุณาลองใหม่พรุ่งนี้" };
    if (error instanceof ConflictError) return { status: "ERROR", code: "CONFLICT", message: "รายการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด" };
    if (error instanceof ForbiddenError || error instanceof ApplicationError && error.code === "UNAUTHENTICATED") return { status: "ERROR", code: "FORBIDDEN", message: SUPPORT_REPORT_SUBMIT_FORBIDDEN_MESSAGE };
    return { status: "ERROR", code: "UNAVAILABLE", message: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่ภายหลัง" };
  }
}

export async function updateSupportReportStatusAction(input: unknown): Promise<SupportReportActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await updateAdminSupportReportStatus(actor, input);
    const reportId = typeof input === "object" && input !== null && "reportId" in input && typeof input.reportId === "string" ? input.reportId : "";
    return { status: "SUCCESS", reportId };
  } catch (error: unknown) {
    if (error instanceof ValidationError) return { status: "ERROR", code: "VALIDATION", message: "คำขอเปลี่ยนสถานะไม่ถูกต้อง" };
    if (error instanceof ConflictError) return { status: "ERROR", code: "CONFLICT", message: "สถานะรายงานเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด" };
    if (error instanceof ForbiddenError || error instanceof ApplicationError && error.code === "UNAUTHENTICATED") return { status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์จัดการรายงานนี้" };
    return { status: "ERROR", code: "UNAVAILABLE", message: "เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่" };
  }
}
