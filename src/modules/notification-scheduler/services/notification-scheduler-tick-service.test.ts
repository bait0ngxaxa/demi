import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
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
    const [strings, completedAt] = harness.executeRaw.mock.calls[0] as [TemplateStringsArray, Date];
    expect(strings.join("?")).toContain(`UPDATE "NotificationSchedulerState" SET "lastTickCompletedAt"`);
    expect(completedAt).toEqual(now);
    expect(dependencies.logSummary).toHaveBeenCalledWith(result);
  });

  it.each(["drainMedication", "drainAppointment", "purgeAppointment", "purgeMedication"] as const)(
    "isolates a failing %s step from the others",
    async (failing) => {
      const harness = fakeDatabase();
      const dependencies = steps({ [failing]: vi.fn().mockRejectedValue(new Error("private failure detail")) });
      const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });
      if (result.status !== "COMPLETED") throw new Error("expected a completed tick");
      const failedStep = { drainMedication: "medicationDrain", drainAppointment: "appointmentDrain", purgeAppointment: "appointmentPurge", purgeMedication: "medicationPurge" }[failing];
      for (const [name, report] of Object.entries(result.steps)) {
        expect(report.status).toBe(name === failedStep ? "FAILED" : "COMPLETED");
      }
      for (const step of ["drainMedication", "drainAppointment", "purgeAppointment", "purgeMedication"] as const) {
        expect(dependencies[step]).toHaveBeenCalledOnce();
      }
      expect(harness.executeRaw).toHaveBeenCalledOnce();
      expect(JSON.stringify(result)).not.toContain("private failure detail");
    },
  );

  it("keeps launching batches round-robin while a drain returns full batches", async () => {
    const harness = fakeDatabase();
    const drainMedication = vi.fn()
      .mockResolvedValueOnce(drainCounts(20))
      .mockResolvedValueOnce(drainCounts(20))
      .mockResolvedValueOnce(drainCounts(5));
    const drainAppointment = vi.fn().mockResolvedValueOnce(drainCounts(20)).mockResolvedValueOnce(drainCounts(0));
    const result = await runNotificationSchedulerTick({ ...steps({ drainMedication, drainAppointment }), database: harness.database });
    expect(drainMedication).toHaveBeenCalledTimes(3);
    expect(drainAppointment).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ steps: { medicationDrain: { batches: 3, counts: { claimed: 45 } }, appointmentDrain: { batches: 2, counts: { claimed: 20 } } } });
  });

  it("stops launching new batches once the launch budget is spent", async () => {
    const harness = fakeDatabase();
    let clock = 0;
    const drainMedication = vi.fn(async () => { clock += 600; return drainCounts(20); });
    const drainAppointment = vi.fn(async () => { clock += 600; return drainCounts(20); });
    const dependencies = steps({ drainMedication, drainAppointment, monotonicNow: () => clock, launchBudgetMs: 1_000 });
    const result = await runNotificationSchedulerTick({ ...dependencies, database: harness.database });
    expect(drainMedication).toHaveBeenCalledOnce();
    expect(drainAppointment).toHaveBeenCalledOnce();
    expect(dependencies.purgeAppointment).not.toHaveBeenCalled();
    expect(dependencies.purgeMedication).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "COMPLETED", durationMs: 1_200, steps: { appointmentPurge: { status: "NOT_STARTED" }, medicationPurge: { status: "NOT_STARTED" } } });
    expect(harness.executeRaw).toHaveBeenCalledOnce();
  });

  it("logs a bare failure and rethrows when the lock transaction fails", async () => {
    const database = { $transaction: vi.fn().mockRejectedValue(new Error("private database error")) } as unknown as PrismaClient;
    const dependencies = steps();
    await expect(runNotificationSchedulerTick({ ...dependencies, database })).rejects.toThrow("private database error");
    expect(dependencies.logSummary).toHaveBeenCalledWith({ status: "FAILED" });
  });
});
