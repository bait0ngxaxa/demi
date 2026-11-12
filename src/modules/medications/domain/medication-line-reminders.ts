import { LineReachability } from "@prisma/client";

import type { LineNotificationCardCopy } from "@/modules/line/services/line-notification-card";

export const MEDICATION_LINE_REMINDER_TEXT = "ถึงเวลาตามการแจ้งเตือนยาที่คุณตั้งไว้แล้ว กรุณาเปิด DEMI เพื่อตรวจสอบ";

/**
 * ADR-0033: the reminder card. A reminder row references exactly one
 * schedule of one PersonalMedication, so the body names that medication; the
 * altText (lock screen, chat list) carries the time only, never the name.
 * `localTime` is the occurrence's immutable "HH:mm" (Asia/Bangkok).
 */
export function medicationLineReminderCopy(input: { localTime: string; medicationName: string | null }): {
  text: string;
  card: LineNotificationCardCopy;
} {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(input.localTime)) throw new RangeError("Reminder time is not HH:mm");
  const time = `${input.localTime} น.`;
  const name = input.medicationName?.trim();
  const boundedName = name ? ([...name].length <= 120 ? name : `${[...name].slice(0, 119).join("")}…`) : null;
  return {
    text: MEDICATION_LINE_REMINDER_TEXT,
    card: {
      tone: "info",
      title: "ยาถึงเวลาแล้ว",
      fields: [
        { label: "เวลา", value: time },
        ...(boundedName ? [{ label: "ยา", value: boundedName }] : []),
      ],
      note: "ตามการแจ้งเตือนยาที่คุณตั้งไว้",
      destination: "OPEN_PATIENT_MEDICATIONS",
      actionLabel: "ดูรายการยา",
      altText: `ยาถึงเวลาแล้ว: ${time}`,
    },
  };
}
export const MEDICATION_LINE_REMINDER_BATCH_SIZE = 20;
export const MEDICATION_LINE_REMINDER_MATERIALIZE_LIMIT = 200;
export const MEDICATION_LINE_REMINDER_LEASE_MS = 30_000;
export const MEDICATION_LINE_REMINDER_MAX_ATTEMPTS = 3;
export const MEDICATION_LINE_REMINDER_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const MEDICATION_LINE_REMINDER_TERMINAL_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
// Maximum lateness, measured from the occurrence instant (Asia/Bangkok localDate + localTime), at which an
// occurrence may be materialized or receive its first delivery attempt. Later occurrences are never caught up.
// PROVISIONAL ENGINEERING DEFAULT — NOT PRODUCT OWNER APPROVED: 15 minutes tolerates scheduler jitter and a few
// missed invocations of a frequent (about every 5 minutes) drain. Retries of an attempted delivery follow
// MEDICATION_LINE_REMINDER_RETRY_WINDOW_MS instead.
export const MEDICATION_LINE_REMINDER_MAX_LATENESS_MS = 15 * 60 * 1000;

export function isMedicationLineReminderOccurrenceExpired(occurrenceDueAt: Date, now: Date): boolean {
  return now.getTime() - occurrenceDueAt.getTime() > MEDICATION_LINE_REMINDER_MAX_LATENESS_MS;
}

export function medicationLineReminderRetryDelayMs(attemptCount: number, random: () => number = Math.random): number {
  const base = attemptCount === 1 ? 60_000 : attemptCount === 2 ? 240_000 : null;
  if (base === null) throw new RangeError("No medication reminder retry remains");
  const value = random();
  const sample = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  return Math.floor(base * (0.9 + sample * 0.2));
}

export function isFreshMedicationReminderFriend(input: { reachability: LineReachability; observedAt: Date | null; now: Date }): boolean {
  if (input.reachability !== LineReachability.FRIEND || !input.observedAt) return false;
  const age = input.now.getTime() - input.observedAt.getTime();
  return age >= 0 && age <= 30 * 24 * 60 * 60 * 1000;
}
