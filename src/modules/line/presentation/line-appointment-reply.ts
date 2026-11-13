import "server-only";

import type { AppointmentLocationType } from "@prisma/client";

import {
  appointmentCardAltText,
  appointmentCardFields,
} from "@/modules/appointments/domain/appointment-card-fields";
import {
  APPOINTMENT_LOCATION_VALUES,
  APPOINTMENT_TYPE_VALUES,
  type AppointmentTypeValue,
} from "@/modules/appointments/domain/appointment-definitions";

import type { LineNotificationCardCopy } from "../services/line-notification-card";

export type LineAppointmentReplyData = {
  scheduledAt: Date;
  hospitalName: string;
  type: AppointmentTypeValue;
  locationType: AppointmentLocationType | null;
};

export type LineAppointmentReplyInput =
  | LineAppointmentReplyData
  | "EMPTY"
  | "INELIGIBLE"
  | "INFRASTRUCTURE_FAILURE";

/**
 * The reply and its explicit kind; callers classify on `kind`, never on text.
 * A found appointment and an empty result carry both today's text and the
 * ADR-0033 card copy, so the caller can fall back to the text when the card
 * cannot be built. INELIGIBLE and INFRASTRUCTURE_FAILURE are text only: an
 * ineligible account cannot use any card destination, and a failure reply
 * must not depend on the card builder.
 */
export type LineAppointmentReply =
  | { kind: "APPOINTMENT" | "EMPTY"; text: string; card: LineNotificationCardCopy }
  | { kind: "INELIGIBLE" | "INFRASTRUCTURE_FAILURE"; text: string };

export const LINE_APPOINTMENT_REPLY_COPY = {
  EMPTY: "ไม่พบนัดหมายที่กำลังจะมาถึง",
  INELIGIBLE:
    "ยังไม่สามารถตรวจสอบนัดหมายผ่าน LINE ได้ กรุณาเปิด “จัดการบัญชี DEMI” จากเมนู",
  INFRASTRUCTURE_FAILURE:
    "ขณะนี้ยังตรวจสอบนัดหมายไม่ได้ กรุณาลองใหม่ภายหลัง",
} as const;

const LINE_APPOINTMENT_REPLY_TITLE = "นัดหมายถัดไปของคุณ";

/** No fields: there is no appointment fact to show, only the way to ask for a home visit. */
const LINE_EMPTY_APPOINTMENT_REPLY_CARD: LineNotificationCardCopy = {
  tone: "info",
  title: "ยังไม่มีนัดหมาย",
  fields: [],
  note: "หากต้องการให้ อสม. มาเยี่ยมบ้าน ขอรับบริการได้จากปุ่มด้านล่าง",
  destination: "OPEN_PATIENT_SERVICES",
  actionLabel: "ขอรับบริการ",
  altText: "ยังไม่มีนัดหมายที่กำลังจะมาถึง",
};

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

function categoryReply(kind: "INELIGIBLE" | "INFRASTRUCTURE_FAILURE"): LineAppointmentReply {
  return { kind, text: LINE_APPOINTMENT_REPLY_COPY[kind] };
}

export function formatLineAppointmentReply(input: LineAppointmentReplyInput): LineAppointmentReply {
  if (input === "EMPTY") {
    return { kind: "EMPTY", text: LINE_APPOINTMENT_REPLY_COPY.EMPTY, card: LINE_EMPTY_APPOINTMENT_REPLY_CARD };
  }
  if (typeof input === "string") {
    return categoryReply(input);
  }

  const hospitalName = normalizeHospitalName(input.hospitalName);
  if (
    !hospitalName ||
    !(input.scheduledAt instanceof Date) || Number.isNaN(input.scheduledAt.getTime()) ||
    !(APPOINTMENT_TYPE_VALUES as readonly string[]).includes(input.type) ||
    (input.locationType !== null && !(APPOINTMENT_LOCATION_VALUES as readonly string[]).includes(input.locationType))
  ) {
    return categoryReply("INFRASTRUCTURE_FAILURE");
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
    return categoryReply("INFRASTRUCTURE_FAILURE");
  }

  const facts = {
    appointmentType: input.type,
    scheduledAt: input.scheduledAt,
    locationType: input.locationType,
    hospitalName,
    // The Patient's own reply: never their name, notes or the assignee.
    patientDisplayName: null,
  };
  return {
    kind: "APPOINTMENT",
    text: [
      LINE_APPOINTMENT_REPLY_TITLE,
      `วันที่ ${day} ${month} ${year} เวลา ${hour}:${minute} น.`,
      `โรงพยาบาล ${hospitalName}`,
    ].join("\n"),
    card: {
      tone: "info",
      title: LINE_APPOINTMENT_REPLY_TITLE,
      fields: appointmentCardFields(facts),
      destination: "OPEN_PATIENT_APPOINTMENTS",
      actionLabel: "ดูนัดหมายทั้งหมด",
      altText: appointmentCardAltText(LINE_APPOINTMENT_REPLY_TITLE, facts),
    },
  };
}
