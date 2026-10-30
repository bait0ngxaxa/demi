import type {
  PatientServiceCode,
  PatientServiceRequestStatus,
} from "@prisma/client";

import { PATIENT_SERVICE_LABELS } from "../domain/patient-service-definitions";
import type { HospitalServiceRequestListInput } from "../schemas/patient-service-request-schemas";

export const hospitalServiceRequestGroups = [
  {
    key: "PENDING",
    label: "รอตรวจสอบ",
    description: "ตรวจคำขอของผู้ป่วย แล้วเลือกอนุมัติหรือไม่อนุมัติ",
    empty: "ไม่มีคำขอรอตรวจสอบในกลุ่มนี้ สามารถเลือกดูคำขอที่อนุมัติแล้วหรือประวัติได้",
  },
  {
    key: "APPROVED",
    label: "อนุมัติแล้ว",
    description: "คำขอได้รับการอนุมัติแล้ว เปิดงานดูแลผู้ป่วยเพื่อดำเนินงานต่อ และยืนยันสถานะเมื่อเริ่มให้บริการ",
    empty: "ไม่มีคำขอที่อยู่ในสถานะอนุมัติแล้วในกลุ่มนี้",
  },
  {
    key: "HISTORY",
    label: "เริ่มบริการและประวัติ",
    description: "คำขอที่เริ่มให้บริการ ไม่อนุมัติ หรือถอนแล้ว แสดงเพื่ออ่านประวัติ ไม่มีการดำเนินการตรวจสอบเพิ่มเติม",
    empty: "ยังไม่มีคำขอที่เริ่มให้บริการ ไม่อนุมัติ หรือถอนแล้วในกลุ่มนี้",
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
      return "อนุมัติคำขอแล้ว";
    case "STARTED":
      return "เริ่มให้บริการแล้ว";
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
