import { NotificationSchedulerTickStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { getNotificationSchedulerReadiness, NOTIFICATION_SCHEDULER_HEALTHY_MAX_AGE_MS } from "./notification-scheduler-readiness-service";
import { runNotificationSchedulerTick } from "./notification-scheduler-tick-service";

const lastSuccess = new Date("2026-10-19T08:00:00.000Z");
const emptyAggregate = { _count: { _all: 0 }, _min: { createdAt: null } };

function readinessDatabase(
  lastTickCompletedAt: Date | null,
  lastTickStatus: NotificationSchedulerTickStatus | null = lastTickCompletedAt ? NotificationSchedulerTickStatus.COMPLETED : null,
): PrismaClient {
  return {
    notificationSchedulerState: { findUnique: vi.fn(async () => ({ lastTickCompletedAt, lastTickStatus })) },
    appointmentLineNotification: { aggregate: vi.fn(async () => emptyAggregate) },
    medicationLineReminderNotification: { aggregate: vi.fn(async () => emptyAggregate) },
  } as unknown as PrismaClient;
}

describe("notification scheduler readiness", () => {
  it("is healthy only while a fully successful tick remains recent", async () => {
    const now = new Date(lastSuccess.getTime() + NOTIFICATION_SCHEDULER_HEALTHY_MAX_AGE_MS);
    const healthy = await getNotificationSchedulerReadiness({ database: readinessDatabase(lastSuccess), now: new Date(now.getTime() - 1) });
    const stale = await getNotificationSchedulerReadiness({ database: readinessDatabase(lastSuccess), now: new Date(now.getTime() + 1) });
    const failed = await getNotificationSchedulerReadiness({ database: readinessDatabase(lastSuccess, NotificationSchedulerTickStatus.FAILED), now });
    const deferred = await getNotificationSchedulerReadiness({ database: readinessDatabase(lastSuccess, NotificationSchedulerTickStatus.DEFERRED), now });
    const neverSucceeded = await getNotificationSchedulerReadiness({ database: readinessDatabase(null), now });
    const clockMovedBack = await getNotificationSchedulerReadiness({ database: readinessDatabase(new Date(now.getTime() + 1)), now });

    expect(healthy).toMatchObject({ healthy: true, lastTickAgeSeconds: 599 });
    expect(failed).toMatchObject({ healthy: false, lastTickAgeSeconds: 600, lastTickStatus: "FAILED" });
    expect(deferred).toMatchObject({ healthy: false, lastTickStatus: "DEFERRED" });
    expect(stale).toMatchObject({ healthy: false, lastTickAgeSeconds: 600 });
    expect(neverSucceeded).toMatchObject({ healthy: false, lastTickAgeSeconds: null, lastTickStatus: null, lastTickCompletedAt: null });
    expect(clockMovedBack.healthy).toBe(false);
  });

  it("repeated failed ticks cannot advance readiness success time", async () => {
    const state: { lastTickCompletedAt: Date | null; lastTickStatus: NotificationSchedulerTickStatus | null } = {
      lastTickCompletedAt: new Date(lastSuccess.getTime() - 120_000),
      lastTickStatus: NotificationSchedulerTickStatus.COMPLETED,
    };
    const queryRaw = vi.fn(async (query: TemplateStringsArray) => query.join("").includes("pg_try_advisory_xact_lock")
      ? [{ acquired: true }]
      : [{ lastTickCompletedAt: state.lastTickCompletedAt }]);
    const executeRaw = vi.fn(async (
      _query: TemplateStringsArray,
      status: NotificationSchedulerTickStatus,
      _repeatedStatus: NotificationSchedulerTickStatus,
      completedAt: Date,
    ) => {
      state.lastTickStatus = status;
      if (status === NotificationSchedulerTickStatus.COMPLETED) state.lastTickCompletedAt = completedAt;
      return 1;
    });
    const database = {
      $transaction: vi.fn(async (operation: (transaction: unknown) => Promise<unknown>) => operation({ $queryRaw: queryRaw, $executeRaw: executeRaw })),
      notificationSchedulerState: { findUnique: vi.fn(async () => ({ ...state })) },
      appointmentLineNotification: { aggregate: vi.fn(async () => emptyAggregate) },
      medicationLineReminderNotification: { aggregate: vi.fn(async () => emptyAggregate) },
    } as unknown as PrismaClient;

    const successful = await runNotificationSchedulerTick({
      database,
      now: () => lastSuccess,
      monotonicNow: () => 0,
      drainMedication: async () => ({ claimed: 0 }),
      drainAppointment: async () => ({ claimed: 0 }),
      purgeAppointment: async () => 0,
      purgeMedication: async () => 0,
      logSummary: () => undefined,
    });
    expect(successful.status).toBe("COMPLETED");
    expect(state.lastTickStatus).toBe(NotificationSchedulerTickStatus.COMPLETED);

    for (const minutesAfterSuccess of [5, 10, 15]) {
      const now = new Date(lastSuccess.getTime() + minutesAfterSuccess * 60_000);
      const result = await runNotificationSchedulerTick({
        database,
        now: () => now,
        monotonicNow: () => 0,
        drainMedication: async () => { throw new Error("private provider or database detail"); },
        drainAppointment: async () => ({ claimed: 0 }),
        purgeAppointment: async () => 0,
        purgeMedication: async () => 0,
        logSummary: () => undefined,
      });
      expect(result.status).toBe("FAILED");
      expect(JSON.stringify(result)).not.toContain("private");
      const readiness = await getNotificationSchedulerReadiness({ database, now });
      expect(readiness).toMatchObject({ healthy: false, lastTickStatus: "FAILED", lastTickCompletedAt: lastSuccess.toISOString() });
    }

    expect(state.lastTickCompletedAt).toEqual(lastSuccess);
    expect(state.lastTickStatus).toBe(NotificationSchedulerTickStatus.FAILED);
    expect(executeRaw).toHaveBeenCalledTimes(4);
    const readiness = await getNotificationSchedulerReadiness({ database, now: new Date(lastSuccess.getTime() + 15 * 60_000) });
    expect(readiness).toMatchObject({ healthy: false, lastTickAgeSeconds: 900, lastTickCompletedAt: lastSuccess.toISOString() });
  });
});
