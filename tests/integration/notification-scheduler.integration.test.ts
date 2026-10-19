import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { getNotificationSchedulerReadiness } from "@/modules/notification-scheduler/services/notification-scheduler-readiness-service";
import {
  NOTIFICATION_SCHEDULER_MIN_INTERVAL_MS,
  runNotificationSchedulerTick,
  type NotificationSchedulerTickDependencies,
} from "@/modules/notification-scheduler/services/notification-scheduler-tick-service";

const database = getPrisma();
const counts = { claimed: 0, providerAccepted: 0, retryScheduled: 0, suppressed: 0, permanentFailure: 0, unknownOutcome: 0 };

function stubSteps(overrides: Partial<NotificationSchedulerTickDependencies> = {}): NotificationSchedulerTickDependencies {
  return {
    database,
    drainMedication: vi.fn(async () => ({ materialized: 0, ...counts })),
    drainAppointment: vi.fn(async () => counts),
    purgeAppointment: vi.fn(async () => 0),
    purgeMedication: vi.fn(async () => 0),
    logSummary: () => undefined,
    ...overrides,
  };
}

async function setLastTick(value: Date | null): Promise<void> {
  await database.notificationSchedulerState.update({ where: { id: 1 }, data: { lastTickCompletedAt: value } });
}

describe("notification scheduler tick on PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Verified local disposable PostgreSQL required");
    await database.$connect();
  });
  beforeEach(async () => { await setLastTick(null); });
  afterAll(async () => {
    await setLastTick(null);
    await database.$disconnect();
  });

  it("lets exactly one of concurrent ticks run while the advisory lock is held", async () => {
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const inside = new Promise<void>((resolve) => { entered = resolve; });
    const blockingDrain = vi.fn(async () => { entered(); await gate; return { materialized: 0, ...counts }; });
    const running = runNotificationSchedulerTick(stubSteps({ drainMedication: blockingDrain }));
    await inside;

    const contenders = stubSteps();
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => runNotificationSchedulerTick(contenders)));
    expect(concurrent).toEqual(Array.from({ length: 6 }, () => ({ status: "SKIPPED", reason: "LOCK_BUSY" })));
    expect(contenders.drainMedication).not.toHaveBeenCalled();

    release();
    await expect(running).resolves.toMatchObject({ status: "COMPLETED" });
    expect(blockingDrain).toHaveBeenCalledOnce();
    expect(await database.notificationSchedulerState.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({ lastTickCompletedAt: expect.any(Date) });
  });

  it("starts exactly one run among simultaneous ticks", async () => {
    const dependencies = stubSteps();
    const results = await Promise.all(Array.from({ length: 8 }, () => runNotificationSchedulerTick(dependencies)));
    expect(results.filter(({ status }) => status === "COMPLETED")).toHaveLength(1);
    expect(dependencies.drainMedication).toHaveBeenCalledOnce();
    expect(dependencies.purgeMedication).toHaveBeenCalledOnce();
  });

  it("skips a tick within 60 seconds of the last completed tick", async () => {
    const completedAt = new Date("2026-10-19T08:00:00.000Z");
    const first = stubSteps({ now: () => completedAt });
    await expect(runNotificationSchedulerTick(first)).resolves.toMatchObject({ status: "COMPLETED" });
    expect(await database.notificationSchedulerState.findUniqueOrThrow({ where: { id: 1 } })).toEqual({ id: 1, lastTickCompletedAt: completedAt });

    const early = stubSteps({ now: () => new Date(completedAt.getTime() + NOTIFICATION_SCHEDULER_MIN_INTERVAL_MS - 1) });
    await expect(runNotificationSchedulerTick(early)).resolves.toEqual({ status: "SKIPPED", reason: "TOO_SOON" });
    expect(early.drainMedication).not.toHaveBeenCalled();

    const due = stubSteps({ now: () => new Date(completedAt.getTime() + NOTIFICATION_SCHEDULER_MIN_INTERVAL_MS) });
    await expect(runNotificationSchedulerTick(due)).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("isolates a failing step and still records the completed tick", async () => {
    const dependencies = stubSteps({ drainAppointment: vi.fn().mockRejectedValue(new Error("private failure")) });
    await expect(runNotificationSchedulerTick(dependencies)).resolves.toMatchObject({
      status: "COMPLETED",
      steps: {
        medicationDrain: { status: "COMPLETED" },
        appointmentDrain: { status: "FAILED" },
        appointmentPurge: { status: "COMPLETED" },
        medicationPurge: { status: "COMPLETED" },
      },
    });
    expect((await database.notificationSchedulerState.findUniqueOrThrow({ where: { id: 1 } })).lastTickCompletedAt).not.toBeNull();
  });

  it("reports the last completed tick and pending outbox depth without identifiers", async () => {
    const before = await getNotificationSchedulerReadiness({ database });
    expect(before.lastTickCompletedAt).toBeNull();
    await expect(runNotificationSchedulerTick(stubSteps({ now: () => new Date("2026-10-19T08:00:00.000Z") }))).resolves.toMatchObject({ status: "COMPLETED" });
    const readiness = await getNotificationSchedulerReadiness({ database });
    expect(readiness.lastTickCompletedAt).toBe("2026-10-19T08:00:00.000Z");
    for (const outbox of Object.values(readiness.outboxes)) {
      expect(Object.keys(outbox).sort()).toEqual(["oldestPendingAgeSeconds", "pending"]);
      expect(Number.isInteger(outbox.pending)).toBe(true);
      expect(outbox.pending === 0 ? outbox.oldestPendingAgeSeconds === null : (outbox.oldestPendingAgeSeconds ?? -1) >= 0).toBe(true);
    }
  });
});
