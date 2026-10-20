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
 * No new work starts after this much of a tick has elapsed. Each queue gets one bounded batch of at most 10
 * sequential LINE pushes (8-second client timeout each); a slow first queue cannot use an unbounded number of turns.
 */
export const NOTIFICATION_SCHEDULER_LAUNCH_BUDGET_MS = 180_000;
/** Each notification queue gets one bounded turn per tick; a full batch is reported as deferred. */
export const NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE = Math.min(
  10,
  APPOINTMENT_LINE_NOTIFICATION_BATCH_SIZE,
  MEDICATION_LINE_REMINDER_BATCH_SIZE,
);
// Bounds the lock-holding callback below the route metadata limit and the self-hosted systemd caller deadline.
const LOCK_TRANSACTION_TIMEOUT_MS = 290_000;
// Arbitrary application-wide key reserved for the notification scheduler tick (pg_try_advisory_xact_lock).
const NOTIFICATION_SCHEDULER_LOCK_KEY = 4_201_028_001;

export type NotificationSchedulerStepName = "medicationDrain" | "appointmentDrain" | "appointmentPurge" | "medicationPurge";

/** Aggregate counts only; never user, binding, appointment or medication identifiers. */
export type NotificationSchedulerStepReport = {
  status: "COMPLETED" | "FAILED" | "DEFERRED" | "NOT_STARTED";
  deferredReason?: "EXECUTION_BUDGET" | "BATCH_LIMIT";
  batches: number;
  counts: Record<string, number>;
};

export type NotificationSchedulerTickResult =
  | { status: "SKIPPED"; reason: "LOCK_BUSY" | "TOO_SOON" }
  | { status: "COMPLETED" | "FAILED" | "DEFERRED"; durationMs: number; steps: Record<NotificationSchedulerStepName, NotificationSchedulerStepReport> };

type DrainCounts = { claimed: number } & Record<string, number>;

export type NotificationSchedulerTickDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  monotonicNow?: () => number;
  launchBudgetMs?: number;
  drainMedication?: (batchSize: number) => Promise<DrainCounts>;
  drainAppointment?: (batchSize: number) => Promise<DrainCounts>;
  purgeAppointment?: () => Promise<number>;
  purgeMedication?: () => Promise<number>;
  logSummary?: (summary: NotificationSchedulerTickResult | { status: "FAILED" }) => void;
};

type Drain = { name: NotificationSchedulerStepName; batchSize: number; run: (batchSize: number) => Promise<DrainCounts> };

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

  // Medication reminders go first because they expire 15 minutes after their occurrence. The bounded batch leaves
  // time for appointment work before the 180-second launch budget even when every LINE call reaches its 8-second cap.
  const drains: Drain[] = [
    {
      name: "medicationDrain",
      batchSize: NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE,
      run: (batchSize) => dependencies.drainMedication
        ? dependencies.drainMedication(batchSize)
        : drainMedicationLineReminderOutbox({ database, batchSize }),
    },
    {
      name: "appointmentDrain",
      batchSize: NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE,
      run: (batchSize) => dependencies.drainAppointment
        ? dependencies.drainAppointment(batchSize)
        : drainAppointmentLineNotificationOutbox({ database, batchSize }),
    },
  ];
  for (const drain of drains) {
    const report = steps[drain.name];
    if (!withinBudget()) {
      report.status = "DEFERRED";
      report.deferredReason = "EXECUTION_BUDGET";
      continue;
    }
    try {
      const counts = await drain.run(drain.batchSize);
      report.status = "COMPLETED";
      report.batches = 1;
      addCounts(report, counts);
      if (counts.claimed >= drain.batchSize) {
        report.status = "DEFERRED";
        report.deferredReason = "BATCH_LIMIT";
      }
    } catch {
      report.status = "FAILED";
    }
  }

  const purges: Array<{ name: NotificationSchedulerStepName; run: () => Promise<number> }> = [
    { name: "appointmentPurge", run: dependencies.purgeAppointment ?? (() => purgeTerminalAppointmentLineNotifications({ database })) },
    { name: "medicationPurge", run: dependencies.purgeMedication ?? (() => purgeTerminalMedicationLineReminderNotifications({ database })) },
  ];
  for (const purge of purges) {
    const report = steps[purge.name];
    if (!withinBudget()) {
      report.status = "DEFERRED";
      report.deferredReason = "EXECUTION_BUDGET";
      continue;
    }
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

function tickStatus(steps: Record<NotificationSchedulerStepName, NotificationSchedulerStepReport>): "COMPLETED" | "FAILED" | "DEFERRED" {
  const reports = Object.values(steps);
  if (reports.some(({ status }) => status === "FAILED" || status === "NOT_STARTED")) return "FAILED";
  if (reports.some(({ status }) => status === "DEFERRED")) return "DEFERRED";
  return "COMPLETED";
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
      const status = tickStatus(steps);
      await transaction.$executeRaw`
        UPDATE "NotificationSchedulerState"
        SET "lastTickStatus" = CAST(${status} AS "NotificationSchedulerTickStatus"),
            "lastTickCompletedAt" = CASE
              WHEN CAST(${status} AS "NotificationSchedulerTickStatus") = 'COMPLETED'::"NotificationSchedulerTickStatus" THEN ${now()}
              ELSE "lastTickCompletedAt"
            END
        WHERE "id" = 1
      `;
      return { status, durationMs: Math.max(0, Math.round(monotonicNow() - startedAt)), steps };
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
