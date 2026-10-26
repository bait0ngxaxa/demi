import { Role, SupportReportCategory, SupportReportStatus } from "@prisma/client";

export const SUPPORT_REPORT_CATEGORY_LABELS: Readonly<Record<SupportReportCategory, string>> = {
  [SupportReportCategory.BUG]: "พบข้อผิดพลาด",
  [SupportReportCategory.ACCESS]: "เข้าใช้งานไม่ได้",
  [SupportReportCategory.CONTENT]: "เนื้อหาหรือข้อมูล",
  [SupportReportCategory.OTHER]: "อื่น ๆ",
};

export const SUPPORT_REPORT_STATUS_LABELS: Readonly<Record<SupportReportStatus, string>> = {
  [SupportReportStatus.NEW]: "ใหม่",
  [SupportReportStatus.ACKNOWLEDGED]: "รับทราบแล้ว",
  [SupportReportStatus.RESOLVED]: "แก้ไขแล้ว",
};

/** WB-DF-14 (Product Owner 2026-10-26): every non-ADMIN account may report; the ADMIN is the recipient. */
export const SUPPORT_REPORT_SUBMITTER_ROLES: readonly Role[] = [Role.PATIENT, Role.HOSPITAL, Role.OSM, Role.CAREGIVER];

/** A UI/session hint only; the server re-checks the persisted User and roles inside the submit transaction. */
export function canSubmitSupportReport(roles: readonly Role[]): boolean {
  return !roles.includes(Role.ADMIN) && roles.some((role) => SUPPORT_REPORT_SUBMITTER_ROLES.includes(role));
}
