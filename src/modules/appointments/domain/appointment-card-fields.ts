import type { AppointmentLocationType } from "@prisma/client";

import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_TYPE_LABELS,
  type AppointmentTypeValue,
} from "./appointment-definitions";

/**
 * ADR-0033: the pure appointment field formatting shared by the proactive
 * notification cards (appointments) and the next-appointment reply card
 * (line). A leaf: it imports only appointment definitions, so the line module
 * can use it without a dependency cycle.
 */
export type AppointmentCardFacts = {
  readonly appointmentType: AppointmentTypeValue;
  readonly scheduledAt: Date;
  readonly locationType: AppointmentLocationType | null;
  readonly hospitalName: string;
  /** Null for the Patient and whenever the recipient has no access to the Patient. */
  readonly patientDisplayName: string | null;
};

export type AppointmentCardField = { readonly label: string; readonly value: string };

const BANGKOK_DATE = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const BANGKOK_TIME = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok" });

/** "12 พ.ย. 2569" in Asia/Bangkok: the only date form allowed in altText. */
export function appointmentCardDate(instant: Date): string {
  return BANGKOK_DATE.format(instant);
}

/** "12 พ.ย. 2569 เวลา 09:30 น." in Asia/Bangkok. */
export function appointmentCardDateTime(instant: Date): string {
  return `${BANGKOK_DATE.format(instant)} เวลา ${BANGKOK_TIME.format(instant)} น.`;
}

/** Bounded to the card's field limit; cut at a code point, never inside a character. */
export function boundedCardValue(value: string, max = 120): string {
  const characters = [...value.trim()];
  return characters.length <= max ? characters.join("") : `${characters.slice(0, max - 1).join("")}…`;
}

export function appointmentCardFields(facts: AppointmentCardFacts): AppointmentCardField[] {
  return [
    { label: "ประเภท", value: APPOINTMENT_TYPE_LABELS[facts.appointmentType] },
    { label: "วันเวลา", value: appointmentCardDateTime(facts.scheduledAt) },
    ...(facts.locationType ? [{ label: "สถานที่", value: APPOINTMENT_LOCATION_LABELS[facts.locationType] }] : []),
    { label: "หน่วยบริการ", value: boundedCardValue(facts.hospitalName) },
    ...(facts.patientDisplayName ? [{ label: "ผู้ป่วย", value: boundedCardValue(facts.patientDisplayName) }] : []),
  ];
}

/** Lock-screen rule (ADR-0033): title, appointment type and date only. */
export function appointmentCardAltText(title: string, facts: Pick<AppointmentCardFacts, "appointmentType" | "scheduledAt">): string {
  return `${title}: ${APPOINTMENT_TYPE_LABELS[facts.appointmentType]} ${appointmentCardDate(facts.scheduledAt)}`;
}
