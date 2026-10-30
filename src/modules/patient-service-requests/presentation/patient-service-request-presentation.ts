import type {
  PatientServiceCode,
  PatientServiceRequestSlot,
  PatientServiceRequestStatus,
} from "@prisma/client";

import { serviceDateToUtcDate } from "@/shared/time/service-date";

import {
  PATIENT_SERVICE_LABELS,
  PATIENT_SERVICE_REQUEST_SLOT_LABELS,
} from "../domain/patient-service-definitions";
import type { HospitalServiceRequestListInput } from "../schemas/patient-service-request-schemas";

export const hospitalServiceRequestGroups = [
  {
    key: "PENDING",
    label: "รอตรวจสอบ",
    description: "ตรวจคำขอของผู้ป่วย แล้วยืนยันนัดเยี่ยมบ้านหรือไม่อนุมัติพร้อมเหตุผล",
    empty: "ไม่มีคำขอรอตรวจสอบในกลุ่มนี้ สามารถเลือกดูคำขอที่อนุมัติแล้วหรือประวัติได้",
  },
  {
    key: "APPROVED",
    label: "อนุมัติแล้ว",
    description: "คำขอที่อนุมัติไว้ก่อนเปลี่ยนเป็นการยืนยันนัด ยังรอยืนยันนัดเยี่ยมบ้าน",
    empty: "ไม่มีคำขอที่อยู่ในสถานะอนุมัติแล้วในกลุ่มนี้",
  },
  {
    key: "HISTORY",
    label: "ยืนยันนัดและประวัติ",
    description: "คำขอที่ยืนยันนัดแล้ว ไม่อนุมัติ หรือถอนแล้ว แสดงเพื่ออ่านประวัติ ไม่มีการดำเนินการตรวจสอบเพิ่มเติม",
    empty: "ยังไม่มีคำขอที่ยืนยันนัด ไม่อนุมัติ หรือถอนแล้วในกลุ่มนี้",
  },
] as const;

export function hospitalServiceRequestListHref(
  group: HospitalServiceRequestListInput["group"],
  after?: HospitalServiceRequestListInput["after"],
): string {
  const query = new URLSearchParams({ group });
  if (after) {
    query.set("afterDate", after.createdAt);
    query.set("afterId", after.requestId);
  }
  return `/app/patients/service-requests?${query.toString()}`;
}

export function patientServiceLabel(code: PatientServiceCode): string {
  return PATIENT_SERVICE_LABELS[code];
}

export function patientServiceRequestStatusLabel(
  status: PatientServiceRequestStatus,
): string {
  switch (status) {
    case "PENDING":
      return "รอโรงพยาบาลตรวจสอบ";
    case "APPROVED":
      return "อนุมัติคำขอแล้ว รอยืนยันนัด";
    case "STARTED":
      // ADR-0023: STARTED means the appointment is booked.
      return "ยืนยันนัดแล้ว";
    case "REJECTED":
      return "ไม่อนุมัติคำขอ";
    case "WITHDRAWN":
      return "ถอนคำขอแล้ว";
  }
}

export function patientServiceRequestStatusVariant(
  status: PatientServiceRequestStatus,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
    case "STARTED":
      return "success";
    case "REJECTED":
      return "danger";
    case "WITHDRAWN":
      return "neutral";
  }
}

export function formatPatientServiceRequestDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function patientServiceRequestSlotLabel(slot: PatientServiceRequestSlot): string {
  return PATIENT_SERVICE_REQUEST_SLOT_LABELS[slot];
}

/** A preferred date is a calendar date (YYYY-MM-DD), so it is formatted without a time zone shift. */
export function formatPatientServicePreferredDate(preferredDate: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "UTC" }).format(
    serviceDateToUtcDate(preferredDate),
  );
}

/** "ยืนยันนัด" prefill: the start of the preferred slot, as a Bangkok `datetime-local` value. */
export function preferredSlotDateTimeInput(
  preferredDate: string | null,
  preferredSlot: PatientServiceRequestSlot | null,
): string {
  if (!preferredDate || !preferredSlot) return "";
  return `${preferredDate}T${preferredSlot === "AFTERNOON" ? "13:00" : "09:00"}`;
}
