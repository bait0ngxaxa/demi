/**
 * Owner decision 2026-11-17: staff may edit a care relationship's Baseline until a Program links it
 * as its initial Baseline; from then on it is read-only. These messages are shared by the service,
 * the server action and the Baseline page.
 */
export const PATIENT_BASELINE_LOCKED_MESSAGE = "เปิดโปรแกรมแล้ว แก้ไขข้อมูลตั้งต้นไม่ได้";

/** Shown on the Baseline page instead of the edit action once a Program links the Baseline. */
export const PATIENT_BASELINE_LOCKED_NOTICE = "เปิดโปรแกรมแล้ว ข้อมูลตั้งต้นแก้ไขไม่ได้";

export const PATIENT_BASELINE_STALE_MESSAGE =
  "ข้อมูลตั้งต้นถูกแก้ไขโดยคำขออื่นแล้ว กรุณาเปิดหน้าข้อมูลตั้งต้นอีกครั้ง";
