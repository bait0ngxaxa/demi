import "server-only";

import {
  AppointmentLineNotificationEventKind,
  AppointmentLineNotificationRecipientKind,
  LineReachability,
  type AppointmentLocationType,
  type PatientServiceCode,
  type PatientServiceRequestSlot,
} from "@prisma/client";

import type { LineWebNavigationIntent } from "@/modules/line/domain/line-navigation-intents";
import type { NotificationCardField, NotificationCardTone } from "@/modules/line/presentation/flex/notification-card";
import {
  PATIENT_SERVICE_LABELS,
  PATIENT_SERVICE_REQUEST_SLOT_LABELS,
} from "@/modules/patient-service-requests/domain/patient-service-definitions";

import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_TYPE_LABELS,
  type AppointmentTypeValue,
} from "./appointment-definitions";

export function appointmentLineNotificationText(type: AppointmentTypeValue): string {
  return `มีนัดหมายประเภท ${APPOINTMENT_TYPE_LABELS[type]} อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ`;
}

/** ADR-0023 (SR-B): informational; the date is a calendar date, so it is formatted without a time zone shift. */
export function patientServiceRequestLineNotificationText(input: {
  serviceCode: PatientServiceCode;
  preferredDate: Date | null;
  preferredSlot: PatientServiceRequestSlot | null;
}): string {
  const when = input.preferredDate && input.preferredSlot
    ? ` วันที่ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "UTC" }).format(input.preferredDate)} ${PATIENT_SERVICE_REQUEST_SLOT_LABELS[input.preferredSlot]}`
    : "";
  return `มีคำขอรับบริการ${PATIENT_SERVICE_LABELS[input.serviceCode]}${when} กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ`;
}

export const OSM_PATIENT_ASSIGNED_LINE_NOTIFICATION_TEXT = "มีผู้ป่วยที่ได้รับมอบหมายให้คุณดูแล กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ";
export const OSM_APPOINTMENT_ASSIGNED_LINE_NOTIFICATION_TEXT = "มีนัดเยี่ยมบ้านที่ได้รับมอบหมายให้คุณ กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ";
export const OSM_RESCHEDULE_REQUESTED_LINE_NOTIFICATION_TEXT = "มีคำขอเลื่อนนัดรอทบทวน กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ";

/**
 * ADR-0033: what a notification card may show, loaded from the current source
 * inside the eligibility transaction. Only data the recipient's DEMI access
 * already shows them; never a national ID, phone, note, location detail or
 * free-text reason. `patientDisplayName` is null whenever the recipient has no
 * access to the Patient; the copy drops it for the Patient recipient.
 */
type AppointmentCardFacts = {
  readonly appointmentType: AppointmentTypeValue;
  readonly scheduledAt: Date;
  readonly locationType: AppointmentLocationType | null;
  readonly hospitalName: string;
  readonly patientDisplayName: string | null;
};

export type AppointmentEventRecipientKind = "PATIENT" | "OSM" | "CAREGIVER";

export type AppointmentLineNotificationContent =
  | ({
      readonly eventKind: "CREATED" | "RESCHEDULED" | "CANCELLED";
      readonly recipientKind: AppointmentEventRecipientKind;
    } & AppointmentCardFacts)
  | ({ readonly eventKind: "OSM_APPOINTMENT_ASSIGNED" } & AppointmentCardFacts)
  | ({ readonly eventKind: "OSM_RESCHEDULE_REQUESTED" } & AppointmentCardFacts)
  | {
      readonly eventKind: "OSM_PATIENT_ASSIGNED";
      readonly hospitalName: string;
      readonly patientDisplayName: string | null;
    }
  | {
      readonly eventKind: "OSM_SERVICE_REQUESTED";
      readonly serviceCode: PatientServiceCode;
      readonly preferredDate: Date | null;
      readonly preferredSlot: PatientServiceRequestSlot | null;
      readonly hospitalName: string;
      readonly patientDisplayName: string | null;
      /**
       * The recipient is the Patient's current assigned อสม. (they read the Patient and have them in their
       * list); otherwise they are a preferred อสม., whom a PENDING request gives no access to the Patient.
       */
      readonly recipientIsAssignedOsm: boolean;
    };

/**
 * Card copy without the button URL, which the delivery resolves from `destination` (ADR-0033 D2). A card
 * without `destination` has no button: there is no page where the recipient can act on it.
 */
export type AppointmentLineNotificationCardCopy = {
  readonly tone: NotificationCardTone;
  readonly title: string;
  readonly fields: readonly NotificationCardField[];
  readonly note?: string;
  readonly actionLabel?: string;
  readonly destination?: LineWebNavigationIntent;
  readonly altText: string;
};

export type AppointmentLineNotificationCopy = {
  /** The text message sent while Flex cards are disabled; unchanged from before ADR-0033. */
  readonly text: string;
  readonly card: AppointmentLineNotificationCardCopy;
};

const BANGKOK_DATE = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const BANGKOK_TIME = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok" });
/** A service request's preferred date is a calendar date: formatted in UTC, never shifted to another day. */
const CALENDAR_DATE = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function bangkokDateTime(instant: Date): string {
  return `${BANGKOK_DATE.format(instant)} เวลา ${BANGKOK_TIME.format(instant)} น.`;
}

/** Bounded to the card's field limit; cut at a code point, never inside a character. */
function boundedValue(value: string, max = 120): string {
  const characters = [...value.trim()];
  return characters.length <= max ? characters.join("") : `${characters.slice(0, max - 1).join("")}…`;
}

export function appointmentPatientDisplayName(person: { givenName: string | null; familyName: string | null }): string | null {
  const name = [person.givenName, person.familyName].map((part) => part?.trim()).filter(Boolean).join(" ");
  return name === "" ? null : name;
}

function appointmentFields(facts: AppointmentCardFacts): NotificationCardField[] {
  return [
    { label: "ประเภท", value: APPOINTMENT_TYPE_LABELS[facts.appointmentType] },
    { label: "วันเวลา", value: bangkokDateTime(facts.scheduledAt) },
    ...(facts.locationType ? [{ label: "สถานที่", value: APPOINTMENT_LOCATION_LABELS[facts.locationType] }] : []),
    { label: "หน่วยบริการ", value: boundedValue(facts.hospitalName) },
    ...(facts.patientDisplayName ? [{ label: "ผู้ป่วย", value: boundedValue(facts.patientDisplayName) }] : []),
  ];
}

/** Lock-screen rule (ADR-0033): event kind, appointment type and date only. */
function appointmentAltText(title: string, facts: AppointmentCardFacts): string {
  return `${title}: ${APPOINTMENT_TYPE_LABELS[facts.appointmentType]} ${BANGKOK_DATE.format(facts.scheduledAt)}`;
}

const APPOINTMENT_EVENT_TITLES = {
  CREATED: "นัดหมายใหม่",
  RESCHEDULED: "เลื่อนนัดหมาย",
  CANCELLED: "ยกเลิกนัดหมาย",
} as const;

const APPOINTMENT_EVENT_DESTINATIONS = {
  PATIENT: { destination: "OPEN_PATIENT_APPOINTMENTS", actionLabel: "ดูนัดหมาย" },
  CAREGIVER: { destination: "OPEN_FAMILY", actionLabel: "ดูนัดหมายครอบครัว" },
  OSM: { destination: "OPEN_WORK_APPOINTMENTS", actionLabel: "ดูนัดหมาย" },
} as const satisfies Record<AppointmentEventRecipientKind, { destination: LineWebNavigationIntent; actionLabel: string }>;

/** ADR-0033: one copy function per notification family; `text` is the exact pre-ADR text. */
export function appointmentEventLineNotificationCopy(
  content: Extract<AppointmentLineNotificationContent, { eventKind: "CREATED" | "RESCHEDULED" | "CANCELLED" }>,
): AppointmentLineNotificationCopy {
  const title = APPOINTMENT_EVENT_TITLES[content.eventKind];
  const facts: AppointmentCardFacts = {
    ...content,
    patientDisplayName: content.recipientKind === "PATIENT" ? null : content.patientDisplayName,
  };
  return {
    text: appointmentLineNotificationText(content.appointmentType),
    card: {
      tone: content.eventKind === "CANCELLED" ? "danger" : content.eventKind === "RESCHEDULED" ? "warning" : "info",
      title,
      fields: appointmentFields(facts),
      ...APPOINTMENT_EVENT_DESTINATIONS[content.recipientKind],
      altText: appointmentAltText(title, facts),
    },
  };
}

export function osmAppointmentAssignedLineNotificationCopy(
  content: Extract<AppointmentLineNotificationContent, { eventKind: "OSM_APPOINTMENT_ASSIGNED" }>,
): AppointmentLineNotificationCopy {
  const title = "ได้รับมอบหมายนัดหมาย";
  return {
    text: OSM_APPOINTMENT_ASSIGNED_LINE_NOTIFICATION_TEXT,
    card: {
      tone: "info",
      title,
      fields: appointmentFields(content),
      destination: "OPEN_WORK_APPOINTMENTS",
      actionLabel: "ดูนัดหมาย",
      altText: appointmentAltText(title, content),
    },
  };
}

export function osmRescheduleRequestedLineNotificationCopy(
  content: Extract<AppointmentLineNotificationContent, { eventKind: "OSM_RESCHEDULE_REQUESTED" }>,
): AppointmentLineNotificationCopy {
  const title = "มีคำขอเลื่อนนัด";
  return {
    text: OSM_RESCHEDULE_REQUESTED_LINE_NOTIFICATION_TEXT,
    card: {
      tone: "warning",
      title,
      fields: appointmentFields(content),
      note: "อสม. ขอเลื่อนนัดนี้ กรุณาทบทวนคำขอใน DEMI",
      destination: "OPEN_WORK_APPOINTMENTS",
      actionLabel: "ทบทวนคำขอ",
      altText: appointmentAltText(title, content),
    },
  };
}

export function osmPatientAssignedLineNotificationCopy(
  content: Extract<AppointmentLineNotificationContent, { eventKind: "OSM_PATIENT_ASSIGNED" }>,
): AppointmentLineNotificationCopy {
  const title = "ได้รับมอบหมายผู้ป่วย";
  return {
    text: OSM_PATIENT_ASSIGNED_LINE_NOTIFICATION_TEXT,
    card: {
      tone: "info",
      title,
      fields: [
        ...(content.patientDisplayName ? [{ label: "ผู้ป่วย", value: boundedValue(content.patientDisplayName) }] : []),
        { label: "หน่วยบริการ", value: boundedValue(content.hospitalName) },
      ],
      destination: "OPEN_OSM_ASSIGNED_PATIENTS",
      actionLabel: "ดูผู้ป่วยที่ดูแล",
      altText: title,
    },
  };
}

export function patientServiceRequestLineNotificationCopy(
  content: Extract<AppointmentLineNotificationContent, { eventKind: "OSM_SERVICE_REQUESTED" }>,
): AppointmentLineNotificationCopy {
  const title = "มีคำขอรับบริการ";
  const service = PATIENT_SERVICE_LABELS[content.serviceCode];
  const preferred = content.preferredDate && content.preferredSlot
    ? { date: CALENDAR_DATE.format(content.preferredDate), slot: PATIENT_SERVICE_REQUEST_SLOT_LABELS[content.preferredSlot] }
    : null;
  // A PENDING request has no appointment, and the request list is staff-only. Only the assigned อสม. has a
  // page to act on: their assigned Patients. A preferred อสม. gets no button and never the Patient's name.
  const patientDisplayName = content.recipientIsAssignedOsm ? content.patientDisplayName : null;
  return {
    text: patientServiceRequestLineNotificationText(content),
    card: {
      tone: "warning",
      title,
      fields: [
        { label: "บริการ", value: service },
        ...(preferred ? [{ label: "วันที่สะดวก", value: `${preferred.date} (${preferred.slot})` }] : []),
        { label: "สถานที่", value: APPOINTMENT_LOCATION_LABELS.HOME_VISIT },
        { label: "หน่วยบริการ", value: boundedValue(content.hospitalName) },
        ...(patientDisplayName ? [{ label: "ผู้ป่วย", value: boundedValue(patientDisplayName) }] : []),
      ],
      note: "โรงพยาบาลจะยืนยันวันเวลานัดอีกครั้ง",
      ...(content.recipientIsAssignedOsm
        ? { destination: "OPEN_OSM_ASSIGNED_PATIENTS" as const, actionLabel: "ดูผู้ป่วยที่ดูแล" }
        : {}),
      altText: preferred ? `${title}: ${service} ${preferred.date}` : `${title}: ${service}`,
    },
  };
}

export function appointmentLineNotificationCopy(content: AppointmentLineNotificationContent): AppointmentLineNotificationCopy {
  switch (content.eventKind) {
    case "CREATED":
    case "RESCHEDULED":
    case "CANCELLED":
      return appointmentEventLineNotificationCopy(content);
    case "OSM_APPOINTMENT_ASSIGNED":
      return osmAppointmentAssignedLineNotificationCopy(content);
    case "OSM_RESCHEDULE_REQUESTED":
      return osmRescheduleRequestedLineNotificationCopy(content);
    case "OSM_PATIENT_ASSIGNED":
      return osmPatientAssignedLineNotificationCopy(content);
    case "OSM_SERVICE_REQUESTED":
      return patientServiceRequestLineNotificationCopy(content);
  }
}

/** The recipient kinds a CREATED/RESCHEDULED/CANCELLED row can carry. */
export function isAppointmentEventRecipientKind(kind: AppointmentLineNotificationRecipientKind): kind is AppointmentEventRecipientKind {
  return kind === AppointmentLineNotificationRecipientKind.PATIENT ||
    kind === AppointmentLineNotificationRecipientKind.OSM ||
    kind === AppointmentLineNotificationRecipientKind.CAREGIVER;
}

export const APPOINTMENT_LINE_NOTIFICATION_MAX_ATTEMPTS = 3;
export const APPOINTMENT_LINE_NOTIFICATION_REACHABILITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const LINE_RETRY_KEY_VALIDITY_MS = 24 * 60 * 60 * 1000;
export const LINE_RETRY_KEY_STOP_MARGIN_MS = 60 * 60 * 1000;
export const APPOINTMENT_LINE_NOTIFICATION_LEASE_MS = 30_000;
export const APPOINTMENT_LINE_NOTIFICATION_BATCH_SIZE = 20;
export const APPOINTMENT_LINE_NOTIFICATION_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function expectedAppointmentStatusForNotification(
  eventKind: AppointmentLineNotificationEventKind,
): "SCHEDULED" | "CANCELLED" {
  return eventKind === AppointmentLineNotificationEventKind.CANCELLED ? "CANCELLED" : "SCHEDULED";
}

export function isFreshLineFriendObservation(input: {
  reachability: LineReachability;
  observedAt: Date | null;
  now: Date;
}): boolean {
  if (input.reachability !== LineReachability.FRIEND || !input.observedAt) return false;
  const age = input.now.getTime() - input.observedAt.getTime();
  return age >= 0 && age <= APPOINTMENT_LINE_NOTIFICATION_REACHABILITY_MAX_AGE_MS;
}

export function appointmentLineNotificationRetryDelayMs(
  attemptCount: number,
  random: () => number = Math.random,
): number {
  const baseDelayMs = attemptCount === 1 ? 60_000 : attemptCount === 2 ? 240_000 : null;
  if (baseDelayMs === null) throw new RangeError("No retry is available for this attempt");

  const sample = random();
  const boundedSample = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
  return Math.floor(baseDelayMs * (0.9 + boundedSample * 0.2));
}

export function isInsideLineRetryKeyWindow(firstAttemptAt: Date, now: Date): boolean {
  const safeDeadline = firstAttemptAt.getTime() + LINE_RETRY_KEY_VALIDITY_MS - LINE_RETRY_KEY_STOP_MARGIN_MS;
  return now.getTime() < safeDeadline;
}

export function appointmentLineNotificationSourceKey(
  appointmentId: string,
  sourceUpdatedAt: Date,
): string {
  return `${appointmentId}:${sourceUpdatedAt.toISOString()}`;
}
