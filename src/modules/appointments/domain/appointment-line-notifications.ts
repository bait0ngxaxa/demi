import "server-only";

import {
  AppointmentLineNotificationEventKind,
  LineReachability,
} from "@prisma/client";
import { z } from "zod";

export const APPOINTMENT_LINE_NOTIFICATION_TEXT =
  "มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ";
export const APPOINTMENT_LINE_NOTIFICATION_MAX_ATTEMPTS = 3;
export const APPOINTMENT_LINE_NOTIFICATION_REACHABILITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const LINE_RETRY_KEY_VALIDITY_MS = 24 * 60 * 60 * 1000;
export const LINE_RETRY_KEY_STOP_MARGIN_MS = 60 * 60 * 1000;
export const APPOINTMENT_LINE_NOTIFICATION_LEASE_MS = 30_000;
export const APPOINTMENT_LINE_NOTIFICATION_BATCH_SIZE = 20;
export const APPOINTMENT_LINE_NOTIFICATION_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const uuidSchema = z.string().uuid();

export type AppointmentLineNotificationRollout = {
  enabled: boolean;
  generation: string | null;
};

export function resolveAppointmentLineNotificationRollout(input: {
  enabled: unknown;
  generation: unknown;
}): AppointmentLineNotificationRollout {
  const generation = uuidSchema.safeParse(input.generation);
  if (input.enabled !== "true" || !generation.success) {
    return { enabled: false, generation: null };
  }

  return { enabled: true, generation: generation.data.toLowerCase() };
}

export function getAppointmentLineNotificationRollout(): AppointmentLineNotificationRollout {
  return resolveAppointmentLineNotificationRollout({
    enabled: process.env.DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED,
    generation: process.env.DEMI_LINE_APPOINTMENT_NOTIFICATIONS_GENERATION,
  });
}

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
