import "server-only";

import { performance } from "node:perf_hooks";
import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { APPOINTMENT_LINE_NOTIFICATION_BATCH_SIZE } from "@/modules/appointments/domain/appointment-line-notifications";
import {
  drainAppointmentLineNotificationOutbox,
  purgeTerminalAppointmentLineNotifications,
} from "@/modules/appointments/services/appointment-line-notification-delivery-service";
import { MEDICATION_LINE_REMINDER_BATCH_SIZE } from "@/modules/medications/domain/medication-line-reminders";
import {
  drainMedicationLineReminderOutbox,
  purgeTerminalMedicationLineReminderNotifications,
} from "@/modules/medications/services/medication-line-reminder-delivery-service";
import { InfrastructureError } from "@/shared/errors/application-error";

/** Ticks closer than this to the last completed tick are skipped. */
export const NOTIFICATION_SCHEDULER_MIN_INTERVAL_MS = 60_000;
/**
 * No new batch starts after this much of a tick has elapsed. One drain batch is at most 20 LINE pushes with an
 * 8-second timeout each, so a batch started just before the budget still finishes inside the route's 300 s maxDuration.
 */
export const NOTIFICATION_SCHEDULER_LAUNCH_BUDGET_MS = 90_000;
// The lock-holding transaction must outlive the steps it guards but end before the platform stops the function.
const LOCK_TRANSACTION_TIMEOUT_MS = 290_000;
// Arbitrary application-wide key reserved for the notification scheduler tick (pg_try_advisory_xact_lock).
const NOTIFICATION_SCHEDULER_LOCK_KEY = 4_201_028_001;

export type NotificationSchedulerStepName = "medicationDrain" | "appointmentDrain" | "appointmentPurge" | "medicationPurge";

/** Aggregate counts only; never user, binding, appointment or medication identifiers. */
export type NotificationSchedulerStepReport = {
  status: "COMPLETED" | "FAILED" | "NOT_STARTED";
  batches: number;
  counts: Record<string, number>;
};

export type NotificationSchedulerTickResult =
  | { status: "SKIPPED"; reason: "LOCK_BUSY" | "TOO_SOON" }
  | { status: "COMPLETED"; durationMs: number; steps: Record<NotificationSchedulerStepName, NotificationSchedulerStepReport> };

type DrainCounts = { claimed: number } & Record<string, number>;

export type NotificationSchedulerTickDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  monotonicNow?: () => number;
  launchBudgetMs?: number;
  drainMedication?: () => Promise<DrainCounts>;
  drainAppointment?: () => Promise<DrainCounts>;
  purgeAppointment?: () => Promise<number>;
  purgeMedication?: () => Promise<number>;
  logSummary?: (summary: NotificationSchedulerTickResult | { status: "FAILED" }) => void;
};

type Drain = { name: NotificationSchedulerStepName; batchSize: number; run: () => Promise<DrainCounts> };

function emptyReport(): NotificationSchedulerStepReport {
  return { status: "NOT_STARTED", batches: 0, counts: {} };
}

function addCounts(report: NotificationSchedulerStepReport, counts: Record<string, number>): void {
  for (const [key, value] of Object.entries(counts)) {
    if (Number.isFinite(value)) report.counts[key] = (report.counts[key] ?? 0) + value;
  }
}

async function runSteps(
  dependencies: NotificationSchedulerTickDependencies,
  database: PrismaClient,
  withinBudget: () => boolean,
): Promise<Record<NotificationSchedulerStepName, NotificationSchedulerStepReport>> {
  const steps: Record<NotificationSchedulerStepName, NotificationSchedulerStepReport> = {
    medicationDrain: emptyReport(),
    appointmentDrain: emptyReport(),
    appointmentPurge: emptyReport(),
    medicationPurge: emptyReport(),
  };

  // Medication reminders go first in every round: they expire 15 minutes after their occurrence.
  let drains: Drain[] = [
    { name: "medicationDrain", batchSize: MEDICATION_LINE_REMINDER_BATCH_SIZE, run: dependencies.drainMedication ?? (() => drainMedicationLineReminderOutbox({ database })) },
    { name: "appointmentDrain", batchSize: APPOINTMENT_LINE_NOTIFICATION_BATCH_SIZE, run: dependencies.drainAppointment ?? (() => drainAppointmentLineNotificationOutbox({ database })) },
  ];
  // Round-robin batches; a drain continues only while its last batch was full, and a failed drain stops for this tick.
  while (drains.length > 0 && withinBudget()) {
    const continuing: Drain[] = [];
    for (const drain of drains) {
      if (!withinBudget()) break;
      const report = steps[drain.name];
      try {
        const counts = await drain.run();
        report.status = "COMPLETED";
        report.batches += 1;
        addCounts(report, counts);
        if (counts.claimed >= drain.batchSize) continuing.push(drain);
      } catch {
        report.status = "FAILED";
      }
    }
    drains = continuing;
  }

  const purges: Array<{ name: NotificationSchedulerStepName; run: () => Promise<number> }> = [
    { name: "appointmentPurge", run: dependencies.purgeAppointment ?? (() => purgeTerminalAppointmentLineNotifications({ database })) },
    { name: "medicationPurge", run: dependencies.purgeMedication ?? (() => purgeTerminalMedicationLineReminderNotifications({ database })) },
  ];
  for (const purge of purges) {
    if (!withinBudget()) break;
    const report = steps[purge.name];
    try {
      const deleted = await purge.run();
      report.status = "COMPLETED";
      report.batches = 1;
      addCounts(report, { deleted });
    } catch {
      report.status = "FAILED";
    }
  }
  return steps;
}

/**
 * One scheduler tick. A transaction-scoped advisory try-lock (safe behind a transaction-mode pooler) makes concurrent
 * ticks exclusive; the persisted completion time skips ticks that arrive too soon. Steps run on separate connections,
 * so the pool needs at least two connections.
 */
export async function runNotificationSchedulerTick(
  dependencies: NotificationSchedulerTickDependencies = {},
): Promise<NotificationSchedulerTickResult> {
  const database = dependencies.database ?? getPrisma();
  const now = dependencies.now ?? (() => new Date());
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const launchBudgetMs = dependencies.launchBudgetMs ?? NOTIFICATION_SCHEDULER_LAUNCH_BUDGET_MS;
  const log = dependencies.logSummary ?? ((summary) => console.info("notification_scheduler_tick", summary));
  const startedAt = monotonicNow();

  let result: NotificationSchedulerTickResult;
  try {
    result = await database.$transaction(async (transaction): Promise<NotificationSchedulerTickResult> => {
      const [lock] = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${NOTIFICATION_SCHEDULER_LOCK_KEY}::bigint) AS "acquired"
      `;
      if (!lock?.acquired) return { status: "SKIPPED", reason: "LOCK_BUSY" };

      const [state] = await transaction.$queryRaw<Array<{ lastTickCompletedAt: Date | null }>>`
        SELECT "lastTickCompletedAt" FROM "NotificationSchedulerState" WHERE "id" = 1
      `;
      if (!state) throw new InfrastructureError("Notification scheduler state is unavailable");
      if (state.lastTickCompletedAt) {
        const elapsed = now().getTime() - state.lastTickCompletedAt.getTime();
        // A completion time in the future (clock moved back) must not block ticks indefinitely.
        if (elapsed >= 0 && elapsed < NOTIFICATION_SCHEDULER_MIN_INTERVAL_MS) return { status: "SKIPPED", reason: "TOO_SOON" };
      }

      const steps = await runSteps(dependencies, database, () => monotonicNow() - startedAt < launchBudgetMs);
      await transaction.$executeRaw`
        UPDATE "NotificationSchedulerState" SET "lastTickCompletedAt" = ${now()} WHERE "id" = 1
      `;
      return { status: "COMPLETED", durationMs: Math.max(0, Math.round(monotonicNow() - startedAt)), steps };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: LOCK_TRANSACTION_TIMEOUT_MS,
    });
  } catch (error: unknown) {
    log({ status: "FAILED" });
    throw error;
  }
  log(result);
  return result;
}
