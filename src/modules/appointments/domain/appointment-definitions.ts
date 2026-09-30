import type { Profession } from "@prisma/client";

export const APPOINTMENT_TYPE_VALUES = ["FOLLOW_UP", "CONSULTATION"] as const;
export type AppointmentTypeValue = (typeof APPOINTMENT_TYPE_VALUES)[number];

export const APPOINTMENT_STATUS_VALUES = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type AppointmentStatusValue = (typeof APPOINTMENT_STATUS_VALUES)[number];

export const APPOINTMENT_LOCATION_VALUES = [
  "CLINIC",
  "ONLINE",
  "HOME_VISIT",
  "OTHER",
] as const;
export type AppointmentLocationValue = (typeof APPOINTMENT_LOCATION_VALUES)[number];

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentTypeValue, string> = {
  FOLLOW_UP: "ติดตามผล",
  CONSULTATION: "ให้คำปรึกษา",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatusValue, string> = {
  SCHEDULED: "นัดหมายแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิกแล้ว",
  NO_SHOW: "ไม่มาตามนัด",
};

export const APPOINTMENT_LOCATION_LABELS: Record<AppointmentLocationValue, string> = {
  CLINIC: "ที่คลินิก/โรงพยาบาล",
  ONLINE: "ออนไลน์",
  HOME_VISIT: "เยี่ยมบ้าน",
  OTHER: "อื่น ๆ",
};

export const APPOINTMENT_DEFAULT_DURATION_MINUTES = 30;
export const APPOINTMENT_HISTORY_LIMIT = 50;

export type AppointmentResponsiblePresentation = {
  heading: string;
  displayName: string;
};

export function appointmentResponsiblePresentation(
  displayName: string | null,
  profession: Profession | null,
): AppointmentResponsiblePresentation {
  if (!displayName) {
    return { heading: "ผู้รับผิดชอบ", displayName: "ยังไม่ระบุ" };
  }

  if (profession === "DOCTOR") {
    return { heading: "แพทย์ผู้ดูแล", displayName };
  }

  if (profession === "NURSE") {
    return { heading: "พยาบาลผู้ดูแล", displayName };
  }

  return { heading: "ผู้รับผิดชอบเดิม", displayName };
}

