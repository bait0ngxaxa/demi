import "server-only";

export type LineAppointmentReplyData = {
  scheduledAt: Date;
  hospitalName: string;
};

export type LineAppointmentReplyInput =
  | LineAppointmentReplyData
  | "EMPTY"
  | "INELIGIBLE"
  | "INFRASTRUCTURE_FAILURE";

export const LINE_APPOINTMENT_REPLY_COPY = {
  EMPTY: "ไม่พบนัดหมายที่กำลังจะมาถึง",
  INELIGIBLE:
    "ยังไม่สามารถตรวจสอบนัดหมายผ่าน LINE ได้ กรุณาเปิด “จัดการบัญชี DEMI” จากเมนู",
  INFRASTRUCTURE_FAILURE:
    "ขณะนี้ยังตรวจสอบนัดหมายไม่ได้ กรุณาลองใหม่ภายหลัง",
} as const;

const appointmentDateTimeFormatter = new Intl.DateTimeFormat(
  "th-TH-u-ca-buddhist-nu-latn",
  {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
);

function normalizeHospitalName(value: string): string | null {
  const normalized = value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized || null;
}

export function formatLineAppointmentReply(input: LineAppointmentReplyInput): string {
  if (typeof input === "string") {
    return LINE_APPOINTMENT_REPLY_COPY[input];
  }

  const hospitalName = normalizeHospitalName(input.hospitalName);
  if (!hospitalName || !(input.scheduledAt instanceof Date) || Number.isNaN(input.scheduledAt.getTime())) {
    return LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE;
  }

  const parts = new Map(
    appointmentDateTimeFormatter
      .formatToParts(input.scheduledAt)
      .map(({ type, value }) => [type, value]),
  );
  const day = parts.get("day");
  const month = parts.get("month");
  const year = parts.get("year");
  const hour = parts.get("hour");
  const minute = parts.get("minute");

  if (!day || !month || !year || !hour || !minute) {
    return LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE;
  }

  return [
    "นัดหมายถัดไปของคุณ",
    `วันที่ ${day} ${month} ${year} เวลา ${hour}:${minute} น.`,
    `โรงพยาบาล ${hospitalName}`,
  ].join("\n");
}
