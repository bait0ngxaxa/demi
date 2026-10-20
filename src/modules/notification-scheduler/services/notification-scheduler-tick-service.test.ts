import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE,
  NOTIFICATION_SCHEDULER_MIN_INTERVAL_MS,
  runNotificationSchedulerTick,
  type NotificationSchedulerTickDependencies,
} from "./notification-scheduler-tick-service";

const now = new Date("2026-10-19T08:00:00.000Z");

function fakeDatabase(input: { acquired?: boolean; lastTickCompletedAt?: Date | null } = {}) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const queryRaw = vi.fn()
    .mockResolvedValueOnce([{ acquired: input.acquired ?? true }])
    .mockResolvedValueOnce([{ lastTickCompletedAt: input.lastTickCompletedAt ?? null }]);
  const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({ $queryRaw: queryRaw, $executeRaw: executeRaw }));
  return { database: { $transaction: transaction } as unknown as PrismaClient, transaction, queryRaw, executeRaw };
}

const drainCounts = (claimed: number) => ({ claimed, providerAccepted: claimed, retryScheduled: 0, suppressed: 0, permanentFailure: 0, unknownOutcome: 0 });

function steps(overrides: Partial<NotificationSchedulerTickDependencies> = {}): NotificationSchedulerTickDependencies {
  return {
    now: () => now,
    monotonicNow: () => 0,
    drainMedication: vi.fn(async () => ({ materialized: 1, ...drainCounts(1) })),
    drainAppointment: vi.fn(async () => drainCounts(2)),
    purgeAppointment: vi.fn(async () => 3),
    purgeMedication: vi.fn(async () => 4),
    logSummary: vi.fn(),
    ...overrides,
  };
}

describe("notification scheduler tick", () => {
  it("takes a transaction-scoped advisory try-lock with a bounded transaction", async () => {
    const harness = fakeDatabase();
    await runNotificationSchedulerTick({ ...steps(), database: harness.database });
    const [strings] = harness.queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join("?")).toContain("pg_try_advisory_xact_lock(");
    expect(harness.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 290_000,
    });
  });

  it("skips without running any step when the lock is busy", async () => {
    const harness = fakeDatabase({ acquired: false });
    const dependencies = steps();
    await expect(runNotificationSchedulerTick({ ...dependencies, database: harness.database })).resolves.toEqual({ status: "SKIPPED", reason: "LOCK_BUSY" });
    expect(dependencies.drainMedication).not.toHaveBeenCalled();
    expect(harness.executeRaw).not.toHaveBeenCalled();
    expect(dependencies.logSummary).toHaveBeenCalledWith({ status: "SKIPPED", reason: "LOCK_BUSY" });
  });

  it("skips a tick within 60 seconds of the last completed tick and runs at 60 seconds", async () => {
    const tooSoon = fakeDatabase({ lastTickCompletedAt: new Date(now.getTime() - NOTIFICATION_SCHEDULER_MIN_INTERVAL_MS + 1) });
    const dependencies = steps();
    await expect(runNotificationSchedulerTick({ ...dependencies, database: tooSoon.database })).resolves.toEqual({ status: "SKIPPED", reason: "TOO_SOON" });
    expect(dependencies.drainAppointment).not.toHaveBeenCalled();
    expect(tooSoon.executeRaw).not.toHaveBeenCalled();

    const due = fakeDatabase({ lastTickCompletedAt: new Date(now.getTime() - NOTIFICATION_SCHEDULER_MIN_INTERVAL_MS) });
    await expect(runNotificationSchedulerTick({ ...steps(), database: due.database })).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("is not blocked by a completion time in the future", async () => {
    const harness = fakeDatabase({ lastTickCompletedAt: new Date(now.getTime() + 3_600_000) });
    await expect(runNotificationSchedulerTick({ ...steps(), database: harness.database })).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("runs every step once, aggregates counts and records completion", async () => {
    const harness = fakeDatabase();
    const dependencies = steps();
    const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });
    expect(result).toEqual({
      status: "COMPLETED",
      durationMs: 0,
      steps: {
        medicationDrain: { status: "COMPLETED", batches: 1, counts: { materialized: 1, ...drainCounts(1) } },
        appointmentDrain: { status: "COMPLETED", batches: 1, counts: drainCounts(2) },
        appointmentPurge: { status: "COMPLETED", batches: 1, counts: { deleted: 3 } },
        medicationPurge: { status: "COMPLETED", batches: 1, counts: { deleted: 4 } },
      },
    });
    const [strings, status, repeatedStatus, completedAt] = harness.executeRaw.mock.calls[0] as [TemplateStringsArray, string, string, Date];
    expect(strings.join("?")).toContain(`UPDATE "NotificationSchedulerState"`);
    expect(strings.join("?")).toContain(`"lastTickCompletedAt"`);
    expect(status).toBe("COMPLETED");
    expect(repeatedStatus).toBe("COMPLETED");
    expect(completedAt).toEqual(now);
    expect(dependencies.logSummary).toHaveBeenCalledWith(result);
  });

  it.each([0, 3])("completes empty and partial queue batches with %i claimed records", async (claimed) => {
    const harness = fakeDatabase();
    const dependencies = steps({
      drainMedication: vi.fn(async () => ({ materialized: 0, ...drainCounts(claimed) })),
      drainAppointment: vi.fn(async () => drainCounts(claimed)),
    });
    const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });

    expect(result).toMatchObject({ status: "COMPLETED", steps: { medicationDrain: { status: "COMPLETED", batches: 1 }, appointmentDrain: { status: "COMPLETED", batches: 1 } } });
    expect(harness.executeRaw).toHaveBeenCalledOnce();
  });

  it.each(["drainMedication", "drainAppointment", "purgeAppointment", "purgeMedication"] as const)(
    "reports a failing %s step and does not advance the successful tick time",
    async (failing) => {
      const harness = fakeDatabase();
      const dependencies = steps({ [failing]: vi.fn().mockRejectedValue(new Error("private failure detail")) });
      const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });
      if (result.status !== "FAILED") throw new Error("expected a failed tick");
      const failedStep = { drainMedication: "medicationDrain", drainAppointment: "appointmentDrain", purgeAppointment: "appointmentPurge", purgeMedication: "medicationPurge" }[failing];
      for (const [name, report] of Object.entries(result.steps)) {
        expect(report.status).toBe(name === failedStep ? "FAILED" : "COMPLETED");
      }
      for (const step of ["drainMedication", "drainAppointment", "purgeAppointment", "purgeMedication"] as const) {
        expect(dependencies[step]).toHaveBeenCalledOnce();
      }
      expect(harness.executeRaw).toHaveBeenCalledOnce();
      expect(harness.executeRaw.mock.calls[0]?.[1]).toBe("FAILED");
      expect(JSON.stringify(result)).not.toContain("private failure detail");
    },
  );

  it("reports multiple independent failures without exposing failure details", async () => {
    const harness = fakeDatabase();
    const dependencies = steps({
      drainMedication: vi.fn().mockRejectedValue(new Error("private medication detail")),
      purgeAppointment: vi.fn().mockRejectedValue(new Error("private purge detail")),
    });
    const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });
    expect(result).toMatchObject({
      status: "FAILED",
      steps: { medicationDrain: { status: "FAILED" }, appointmentDrain: { status: "COMPLETED" }, appointmentPurge: { status: "FAILED" }, medicationPurge: { status: "COMPLETED" } },
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(harness.executeRaw).toHaveBeenCalledOnce();
    expect(harness.executeRaw.mock.calls[0]?.[1]).toBe("FAILED");
  });

  it.each(["medication", "appointment"] as const)("makes bounded progress for a %s-only backlog", async (backlogged) => {
    const harness = fakeDatabase();
    const drainMedication = vi.fn(async () => drainCounts(backlogged === "medication" ? NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE : 0));
    const drainAppointment = vi.fn(async () => drainCounts(backlogged === "appointment" ? NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE : 0));
    const dependencies = steps({ drainMedication, drainAppointment });
    const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });
    expect(drainMedication).toHaveBeenCalledOnce();
    expect(drainAppointment).toHaveBeenCalledOnce();
    expect(drainMedication).toHaveBeenCalledWith(NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE);
    expect(drainAppointment).toHaveBeenCalledWith(NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE);
    expect(result).toMatchObject({
      status: "DEFERRED",
      steps: {
        medicationDrain: { status: backlogged === "medication" ? "DEFERRED" : "COMPLETED" },
        appointmentDrain: { status: backlogged === "appointment" ? "DEFERRED" : "COMPLETED" },
      },
    });
    expect(harness.executeRaw).toHaveBeenCalledOnce();
    expect(harness.executeRaw.mock.calls[0]?.[1]).toBe("DEFERRED");
  });

  it.each(["medication", "appointment"] as const)("still gives the other queue a turn after a slow %s batch", async (slowQueue) => {
    const harness = fakeDatabase();
    let clock = 0;
    const slowDrain = vi.fn(async (batchSize: number) => {
      clock += batchSize * 8_000;
      return drainCounts(batchSize);
    });
    const quickDrain = vi.fn(async () => drainCounts(0));
    const dependencies = steps({
      drainMedication: slowQueue === "medication" ? slowDrain : quickDrain,
      drainAppointment: slowQueue === "appointment" ? slowDrain : quickDrain,
      monotonicNow: () => clock,
    });

    const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });

    expect(dependencies.drainMedication).toHaveBeenCalledOnce();
    expect(dependencies.drainAppointment).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "DEFERRED",
      steps: {
        medicationDrain: { status: slowQueue === "medication" ? "DEFERRED" : "COMPLETED" },
        appointmentDrain: { status: slowQueue === "appointment" ? "DEFERRED" : "COMPLETED" },
      },
    });
    expect(clock).toBe(NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE * 8_000);
  });

  it("gives both full queues a bounded turn when every provider call reaches its timeout", async () => {
    const harness = fakeDatabase();
    let clock = 0;
    let activePushes = 0;
    let maximumConcurrentPushes = 0;
    const slowProviderPush = vi.fn(async () => {
      activePushes += 1;
      maximumConcurrentPushes = Math.max(maximumConcurrentPushes, activePushes);
      clock += 8_000;
      activePushes -= 1;
    });
    const slowDrain = vi.fn(async (batchSize: number) => {
      for (let index = 0; index < batchSize; index += 1) await slowProviderPush();
      return drainCounts(batchSize);
    });
    const dependencies = steps({ drainMedication: slowDrain, drainAppointment: slowDrain, monotonicNow: () => clock });

    const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });

    expect(slowDrain).toHaveBeenCalledTimes(2);
    expect(slowDrain).toHaveBeenNthCalledWith(1, NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE);
    expect(slowDrain).toHaveBeenNthCalledWith(2, NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE);
    expect(slowProviderPush).toHaveBeenCalledTimes(NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE * 2);
    expect(maximumConcurrentPushes).toBe(1);
    expect(clock).toBe(NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE * 2 * 8_000);
    expect(result).toMatchObject({
      status: "DEFERRED",
      steps: {
        medicationDrain: { status: "DEFERRED", deferredReason: "BATCH_LIMIT", batches: 1 },
        appointmentDrain: { status: "DEFERRED", deferredReason: "BATCH_LIMIT", batches: 1 },
        appointmentPurge: { status: "COMPLETED" },
        medicationPurge: { status: "COMPLETED" },
      },
    });
    expect(harness.executeRaw).toHaveBeenCalledOnce();
    expect(harness.executeRaw.mock.calls[0]?.[1]).toBe("DEFERRED");
  });

  it("marks later work deferred when the launch budget is exhausted", async () => {
    const harness = fakeDatabase();
    let clock = 0;
    const drainMedication = vi.fn(async () => {
      clock = 180_000;
      return drainCounts(NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE);
    });
    const drainAppointment = vi.fn(async () => drainCounts(0));
    const dependencies = steps({ drainMedication, drainAppointment, monotonicNow: () => clock });

    const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });

    expect(drainMedication).toHaveBeenCalledOnce();
    expect(drainAppointment).not.toHaveBeenCalled();
    expect(dependencies.purgeAppointment).not.toHaveBeenCalled();
    expect(dependencies.purgeMedication).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "DEFERRED",
      steps: {
        medicationDrain: { status: "DEFERRED", deferredReason: "BATCH_LIMIT" },
        appointmentDrain: { status: "DEFERRED", deferredReason: "EXECUTION_BUDGET" },
        appointmentPurge: { status: "DEFERRED", deferredReason: "EXECUTION_BUDGET" },
        medicationPurge: { status: "DEFERRED", deferredReason: "EXECUTION_BUDGET" },
      },
    });
    expect(harness.executeRaw).toHaveBeenCalledOnce();
    expect(harness.executeRaw.mock.calls[0]?.[1]).toBe("DEFERRED");
  });

  it("logs a bare failure and rethrows when the lock transaction fails", async () => {
    const database = { $transaction: vi.fn().mockRejectedValue(new Error("private database error")) } as unknown as PrismaClient;
    const dependencies = steps();
    await expect(runNotificationSchedulerTick({ ...dependencies, database })).rejects.toThrow("private database error");
    expect(dependencies.logSummary).toHaveBeenCalledWith({ status: "FAILED" });
  });
});
