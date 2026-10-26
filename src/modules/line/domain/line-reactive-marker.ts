/**
 * Legacy appointment postback. New menus send a message action instead, but
 * previously provisioned menus and earlier quick replies may still deliver it.
 */
export const LINE_PATIENT_NEXT_APPOINTMENT_MARKER =
  "DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1" as const;

/** Text the Patient appointment message action sends; one of the exact keywords. */
export const LINE_PATIENT_NEXT_APPOINTMENT_MESSAGE_TEXT = "นัด" as const;
