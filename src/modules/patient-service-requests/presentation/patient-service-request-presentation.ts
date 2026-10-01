import type {
  PatientServiceCode,
  PatientServiceRequestStatus,
} from "@prisma/client";

export function patientServiceLabel(code: PatientServiceCode): string {
  switch (code) {
    case "SCREENING":
      return "คัดกรอง";
    case "FOLLOW_UP":
      return "ติดตาม";
    case "EMPOWERMENT":
      return "เสริมพลัง";
  }
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

export function formatPatientServiceRequestDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
