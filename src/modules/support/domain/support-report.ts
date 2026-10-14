import { SupportReportCategory, SupportReportStatus } from "@prisma/client";

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
