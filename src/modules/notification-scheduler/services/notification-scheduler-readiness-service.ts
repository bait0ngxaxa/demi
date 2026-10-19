import "server-only";

import { AppointmentLineNotificationState, MedicationLineReminderState, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError } from "@/shared/errors/application-error";

export type NotificationOutboxReadiness = {
  /** Rows not yet terminal: PENDING, RETRY_SCHEDULED or CLAIMED. */
  pending: number;
  /** Age of the oldest pending row since it was created; null when nothing is pending. */
  oldestPendingAgeSeconds: number | null;
};

/** Operator view: timestamps and aggregate counts only. */
export type NotificationSchedulerReadiness = {
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
    database.notificationSchedulerState.findUnique({ where: { id: 1 }, select: { lastTickCompletedAt: true } }),
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
  return {
    lastTickCompletedAt: state.lastTickCompletedAt?.toISOString() ?? null,
    outboxes: {
      appointmentLineNotifications: outboxReadiness(appointments, now),
      medicationLineReminders: outboxReadiness(medications, now),
    },
  };
}
