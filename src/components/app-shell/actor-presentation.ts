import { Role } from "@prisma/client";

export const roleLabels: Record<Role, string> = {
  [Role.ADMIN]: "ผู้ดูแลระบบ DEMI",
  [Role.HOSPITAL]: "ผู้ใช้งานโรงพยาบาล",
  [Role.OSM]: "อสม.",
  [Role.PATIENT]: "ผู้ป่วย",
  [Role.CAREGIVER]: "ญาติหรือผู้ดูแล",
};
