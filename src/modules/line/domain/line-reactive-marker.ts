/**
 * Legacy appointment postback. New menus send a message action instead, but
 * previously provisioned menus and earlier quick replies may still deliver it.
 */
export const LINE_PATIENT_NEXT_APPOINTMENT_MARKER =
  "DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1" as const;

/** Text the Patient appointment message action sends; one of the exact keywords. */
export const LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT = "ตรวจสอบนัดหมาย" as const;

/**
 * Sent by rich menus provisioned before 2026-11-18 and Quick Replies already
 * in chats, and typed by hand. Keep accepting it as an exact keyword.
 */
export const LINE_PATIENT_NEXT_APPOINTMENT_LEGACY_MESSAGE_TEXT = "นัด" as const;
