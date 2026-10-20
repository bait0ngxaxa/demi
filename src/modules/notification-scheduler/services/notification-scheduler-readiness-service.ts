import "server-only";

import { AppointmentLineNotificationState, MedicationLineReminderState, NotificationSchedulerTickStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError } from "@/shared/errors/application-error";

export type NotificationOutboxReadiness = {
  /** Rows not yet terminal: PENDING, RETRY_SCHEDULED or CLAIMED. */
  pending: number;
  /** Age of the oldest pending row since it was created; null when nothing is pending. */
  oldestPendingAgeSeconds: number | null;
};

/** A 5-minute systemd cadence with a 10-minute bound makes repeated failed or deferred ticks go stale. */
export const NOTIFICATION_SCHEDULER_HEALTHY_MAX_AGE_MS = 10 * 60_000;

/** Operator view: timestamps and aggregate counts only. */
export type NotificationSchedulerReadiness = {
  healthy: boolean;
  /** Age of the last tick that completed every drain and purge; null until one succeeds. */
  lastTickAgeSeconds: number | null;
  /** Outcome of the latest tick that acquired the advisory lock; skips do not replace it. */
  lastTickStatus: NotificationSchedulerTickStatus | null;
  lastTickCompletedAt: string | null;
  outboxes: {
    appointmentLineNotifications: NotificationOutboxReadiness;
    medicationLineReminders: NotificationOutboxReadiness;
  };
};

function outboxReadiness(aggregate: { _count: { _all: number }; _min: { createdAt: Date | null } }, now: Date): NotificationOutboxReadiness {
  const oldest = aggregate._min.createdAt;
  return {
    pending: aggregate._count._all,
    oldestPendingAgeSeconds: oldest ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1000)) : null,
  };
}

export async function getNotificationSchedulerReadiness(
  input: { database?: PrismaClient; now?: Date } = {},
): Promise<NotificationSchedulerReadiness> {
  const database = input.database ?? getPrisma();
  const now = input.now ?? new Date();
  const [state, appointments, medications] = await Promise.all([
    database.notificationSchedulerState.findUnique({ where: { id: 1 }, select: { lastTickCompletedAt: true, lastTickStatus: true } }),
    database.appointmentLineNotification.aggregate({
      where: { state: { in: [AppointmentLineNotificationState.PENDING, AppointmentLineNotificationState.RETRY_SCHEDULED, AppointmentLineNotificationState.CLAIMED] } },
      _count: { _all: true },
      _min: { createdAt: true },
    }),
    database.medicationLineReminderNotification.aggregate({
      where: { state: { in: [MedicationLineReminderState.PENDING, MedicationLineReminderState.RETRY_SCHEDULED, MedicationLineReminderState.CLAIMED] } },
      _count: { _all: true },
      _min: { createdAt: true },
    }),
  ]);
  if (!state) throw new InfrastructureError("Notification scheduler state is unavailable");
  const lastTickCompletedAt = state.lastTickCompletedAt;
  const lastTickStatus = state.lastTickStatus;
  const lastTickAgeMs = lastTickCompletedAt ? now.getTime() - lastTickCompletedAt.getTime() : null;
  const lastTickAgeSeconds = lastTickAgeMs === null ? null : Math.max(0, Math.floor(lastTickAgeMs / 1000));
  return {
    healthy: lastTickStatus === NotificationSchedulerTickStatus.COMPLETED && lastTickAgeMs !== null && lastTickAgeMs >= 0 && lastTickAgeMs <= NOTIFICATION_SCHEDULER_HEALTHY_MAX_AGE_MS,
    lastTickAgeSeconds,
    lastTickStatus: state.lastTickStatus,
    lastTickCompletedAt: lastTickCompletedAt?.toISOString() ?? null,
    outboxes: {
      appointmentLineNotifications: outboxReadiness(appointments, now),
      medicationLineReminders: outboxReadiness(medications, now),
    },
  };
}
