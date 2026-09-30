import type {
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
} from "@prisma/client";

export const APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS: Record<
  AppointmentCancellationRequestStatus,
  string
> = {
  PENDING: "รอโรงพยาบาลพิจารณา",
  APPROVED: "โรงพยาบาลอนุมัติและยกเลิกนัดแล้ว",
  REJECTED: "โรงพยาบาลไม่อนุมัติคำขอ",
  SUPERSEDED: "คำขอนี้สิ้นผลหลังนัดมีการเปลี่ยนแปลง",
};

export const APPOINTMENT_INTERACTION_SOURCE_LABELS: Record<
  AppointmentInteractionSource,
  string
> = {
  PATIENT_SELF: "ผู้ป่วย",
  OSM_PROXY: "OSM บันทึกแทนผู้ป่วย",
};

export const APPOINTMENT_RESCHEDULE_GUIDANCE =
  "หากต้องการเลื่อนนัด กรุณาติดต่อโรงพยาบาลโดยตรง";
