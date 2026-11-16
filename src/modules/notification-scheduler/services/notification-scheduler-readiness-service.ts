import "server-only";

import { AppointmentLineNotificationOutcome, AppointmentLineNotificationState, MedicationLineReminderOutcome, MedicationLineReminderState, NotificationSchedulerTickStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError } from "@/shared/errors/application-error";

export type NotificationOutboxReadiness = {
  /** Rows not yet terminal: PENDING, RETRY_SCHEDULED or CLAIMED. */
  pending: number;
  oldestDueAgeSeconds: number | null;
  /** Age of the oldest pending row since it was created; null when nothing is pending. */
  oldestPendingAgeSeconds: number | null;
  /**
   * Rows suppressed with LINE_INELIGIBLE (no fresh FRIEND observation, or the
   * binding changed) in the last 24 hours. Informational only: a user blocking the
   * Official Account is normal, so this never affects `healthy`.
   */
  lineIneligibleSuppressedLast24Hours: number;
};

/** Persistent deferral becomes stale even when individual delivery batches continue running. */
export const NOTIFICATION_SCHEDULER_HEALTHY_MAX_AGE_MS = 10 * 60_000;
export const NOTIFICATION_LINE_INELIGIBLE_WINDOW_MS = 24 * 60 * 60_000;

/** Operator view: timestamps and aggregate counts only. */
export type NotificationSchedulerReadiness = {
  healthy: boolean;
  /** Age of the last tick that completed every drain and purge; null until one succeeds. */
  lastTickAgeSeconds: number | null;
  /** Outcome of the latest tick that acquired the advisory lock; skips do not replace it. */
  lastTickStatus: NotificationSchedulerTickStatus | null;
  lastTickCompletedAt: string | null;
  deliveryWindowExpiredLast10Minutes: number;
  terminalDeliveryFailuresLast10Minutes: number;
  outboxes: {
    appointmentLineNotifications: NotificationOutboxReadiness;
    medicationLineReminders: NotificationOutboxReadiness;
  };
};

function outboxReadiness(
  aggregate: { _count: { _all: number }; _min: { createdAt: Date | null; dueAt?: Date | null } },
  lineIneligibleSuppressedLast24Hours: number,
  now: Date,
): NotificationOutboxReadiness {
  const oldest = aggregate._min.createdAt;
  return {
    lineIneligibleSuppressedLast24Hours,
    pending: aggregate._count._all,
    oldestDueAgeSeconds: aggregate._min.dueAt && aggregate._min.dueAt <= now
      ? Math.max(0, Math.floor((now.getTime() - aggregate._min.dueAt.getTime()) / 1000)) : null,
    oldestPendingAgeSeconds: oldest ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1000)) : null,
  };
}

export async function getNotificationSchedulerReadiness(
  input: { database?: PrismaClient; now?: Date } = {},
): Promise<NotificationSchedulerReadiness> {
  const database = input.database ?? getPrisma();
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - NOTIFICATION_SCHEDULER_HEALTHY_MAX_AGE_MS);
  const ineligibleSince = new Date(now.getTime() - NOTIFICATION_LINE_INELIGIBLE_WINDOW_MS);
  const [state, appointments, medications, expired, medicationFailures, appointmentFailures, appointmentIneligible, medicationIneligible] = await Promise.all([
    database.notificationSchedulerState.findUnique({ where: { id: 1 }, select: { lastTickCompletedAt: true, lastTickStatus: true } }),
    database.appointmentLineNotification.aggregate({
      where: { state: { in: [AppointmentLineNotificationState.PENDING, AppointmentLineNotificationState.RETRY_SCHEDULED, AppointmentLineNotificationState.CLAIMED] } },
      _count: { _all: true },
      _min: { createdAt: true, dueAt: true },
    }),
    database.medicationLineReminderNotification.aggregate({
      where: { state: { in: [MedicationLineReminderState.PENDING, MedicationLineReminderState.RETRY_SCHEDULED, MedicationLineReminderState.CLAIMED] } },
      _count: { _all: true },
      _min: { createdAt: true, dueAt: true },
    }),
    database.medicationLineReminderNotification.count({ where: {
      state: MedicationLineReminderState.SUPPRESSED, safeOutcome: MedicationLineReminderOutcome.DELIVERY_WINDOW_EXPIRED, terminalAt: { gte: since, lte: now },
    } }),
    database.medicationLineReminderNotification.count({ where: {
      state: { in: [MedicationLineReminderState.PERMANENT_FAILURE, MedicationLineReminderState.OUTCOME_UNKNOWN] }, terminalAt: { gte: since, lte: now },
    } }),
    database.appointmentLineNotification.count({ where: {
      state: { in: [AppointmentLineNotificationState.PERMANENT_FAILURE, AppointmentLineNotificationState.OUTCOME_UNKNOWN] }, terminalAt: { gte: since, lte: now },
    } }),
    database.appointmentLineNotification.count({ where: {
      state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: AppointmentLineNotificationOutcome.LINE_INELIGIBLE, terminalAt: { gte: ineligibleSince, lte: now },
    } }),
    database.medicationLineReminderNotification.count({ where: {
      state: MedicationLineReminderState.SUPPRESSED, safeOutcome: MedicationLineReminderOutcome.LINE_INELIGIBLE, terminalAt: { gte: ineligibleSince, lte: now },
    } }),
  ]);
  if (!state) throw new InfrastructureError("Notification scheduler state is unavailable");
  const lastTickCompletedAt = state.lastTickCompletedAt;
  const lastTickStatus = state.lastTickStatus;
  const lastTickAgeMs = lastTickCompletedAt ? now.getTime() - lastTickCompletedAt.getTime() : null;
  const lastTickAgeSeconds = lastTickAgeMs === null ? null : Math.max(0, Math.floor(lastTickAgeMs / 1000));
  const appointmentHealth = outboxReadiness(appointments, appointmentIneligible, now);
  const medicationHealth = outboxReadiness(medications, medicationIneligible, now);
  // A short burst may defer. Staleness, overdue work, missed windows or terminal delivery
  // failures invalidate health even if a tick recently completed. No new persistence is needed.
  const acceptableStatus = lastTickStatus === NotificationSchedulerTickStatus.COMPLETED || lastTickStatus === NotificationSchedulerTickStatus.DEFERRED;
  return {
    healthy: acceptableStatus && lastTickAgeMs !== null && lastTickAgeMs >= 0 && lastTickAgeMs <= NOTIFICATION_SCHEDULER_HEALTHY_MAX_AGE_MS
      && (medicationHealth.oldestDueAgeSeconds ?? 0) < 300 && (appointmentHealth.oldestDueAgeSeconds ?? 0) < 600
      && expired === 0 && medicationFailures + appointmentFailures === 0,
    deliveryWindowExpiredLast10Minutes: expired,
    terminalDeliveryFailuresLast10Minutes: medicationFailures + appointmentFailures,
    lastTickAgeSeconds,
    lastTickStatus: state.lastTickStatus,
    lastTickCompletedAt: lastTickCompletedAt?.toISOString() ?? null,
    outboxes: {
      appointmentLineNotifications: appointmentHealth,
      medicationLineReminders: medicationHealth,
    },
  };
}
