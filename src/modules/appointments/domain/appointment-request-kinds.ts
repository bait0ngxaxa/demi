import type { AppointmentInteractionSource } from "@prisma/client";

/**
 * The two patient-side requests a Hospital operator decides on (APPT-REQ-TYPE). Operator-facing copy always names the
 * kind; "คำขอนัดหมายรอพิจารณา" remains only as the aggregate fallback when no breakdown is available.
 */
export const APPOINTMENT_REQUEST_KINDS = ["RESCHEDULE", "CANCELLATION"] as const;

export type AppointmentRequestKind = (typeof APPOINTMENT_REQUEST_KINDS)[number];

export const APPOINTMENT_REQUESTS_AGGREGATE_LABEL = "คำขอนัดหมายรอพิจารณา";

/** "Someone asked to …", never an appointment status. */
export const APPOINTMENT_REQUEST_KIND_LABELS: Record<AppointmentRequestKind, string> = {
  RESCHEDULE: "ขอเลื่อนนัด",
  CANCELLATION: "ขอยกเลิกนัด",
};

export const APPOINTMENT_REQUEST_KIND_QUEUE_LABELS: Record<AppointmentRequestKind, string> = {
  RESCHEDULE: "คำขอเลื่อนนัดรอพิจารณา",
  CANCELLATION: "คำขอยกเลิกนัดรอพิจารณา",
};

export const APPOINTMENT_REQUEST_KIND_EMPTY_COPY: Record<AppointmentRequestKind, string> = {
  RESCHEDULE: "ไม่มีคำขอเลื่อนนัดที่รอดำเนินการ",
  CANCELLATION: "ไม่มีคำขอยกเลิกนัดที่รอดำเนินการ",
};

/** Who submitted a reschedule or cancellation request, worded identically on every operator surface. */
export const APPOINTMENT_REQUESTER_LABELS: Record<AppointmentInteractionSource, string> = {
  PATIENT_SELF: "ผู้ป่วย",
  OSM_PROXY: "อสม. แทนผู้ป่วย",
};

/** Operator row-dot label for the request kinds pending on one appointment, or null when none is pending. */
export function pendingAppointmentRequestLabel(pending: { reschedule: boolean; cancellation: boolean }): string | null {
  if (pending.reschedule && pending.cancellation) return "มีคำขอเลื่อนและยกเลิกนัดรอพิจารณา";
  if (pending.reschedule) return "มีคำขอเลื่อนนัดรอพิจารณา";
  if (pending.cancellation) return "มีคำขอยกเลิกนัดรอพิจารณา";
  return null;
}
