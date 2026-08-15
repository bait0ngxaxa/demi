import { Role } from "@prisma/client";

export const roleLabels: Record<Role, string> = {
  [Role.ADMIN]: "ผู้ดูแลระบบ DEMI",
  [Role.HOSPITAL]: "บุคลากรโรงพยาบาล",
  [Role.OSM]: "อสม.",
  [Role.PATIENT]: "ผู้ป่วย",
};
