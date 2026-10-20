import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { runNotificationSchedulerTick } from "./notification-scheduler-tick-service";

function database(initialCompletion: Date | null = null): PrismaClient {
  let lastTickCompletedAt: Date | null = initialCompletion;
  return { $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
    $queryRaw: vi.fn().mockResolvedValueOnce([{ acquired: true }]).mockResolvedValueOnce([{ lastTickCompletedAt }]),
    $executeRaw: async (_query: TemplateStringsArray, status: string, _repeated: string, completedAt: Date) => {
      if (status === "COMPLETED") lastTickCompletedAt = completedAt;
      return 1;
    },
  }) } as unknown as PrismaClient;
}

describe("scheduler burst capacity (synthetic, includes simulated database cost)", () => {
  it.each([10, 50, 100, 200])("drains %i synchronized reminders and appointments in one healthy tick", async (size) => {
    let clock = 0;
    const pending = [size, size];
    const accepted = [0, 0];
    const drain = (queue: number) => async (batchSize: number) => {
      const claimed = Math.min(batchSize, pending[queue]);
      // 250 ms provider + 150 ms total DB/revalidation/settlement per item, 20 ms batch overhead.
      clock += claimed * 400 + 20;
      pending[queue] -= claimed;
      accepted[queue] += claimed;
      return { claimed, providerAccepted: claimed, remainingDue: pending[queue] };
    };
    const result = await runNotificationSchedulerTick({
      database: database(), now: () => new Date("2026-10-20T00:00:00Z"), monotonicNow: () => clock,
      drainMedication: drain(0), drainAppointment: drain(1),
      purgeMedication: async () => 0, purgeAppointment: async () => 0, logSummary: () => undefined,
    });
    expect(accepted).toEqual([size, size]);
    expect(pending).toEqual([0, 0]);
    expect(result.status).toBe("COMPLETED");
    expect(clock).toBeLessThan(180_000);
  });
});

// Policy simulation, not a claim about production LINE latency or successful device delivery.
// Real claim/revalidation/retry/fencing behavior is covered on disposable PostgreSQL.
type Item = { due: number; attempts: number; state: "pending" | "retry" | "accepted" | "expired" | "suppressed"; key: number };
const scenarios = ["immediate", "bounded", "remoteDb", "cadenceSkip", "timeout", "transient", "429", "ambiguous", "optOut", "unlink", "restart"] as const;

describe("successive-tick capacity accounting and fairness", () => {
  it.each([10, 50, 100, 200].flatMap((size) => scenarios.map((scenario) => ({ size, scenario }))))(
    "$size per queue / $scenario", async ({ size, scenario }) => {
      const queues: Item[][] = [0, 1].map(() => Array.from({ length: size }, (_, key) => ({ due: 0, attempts: 0, state: "pending", key })));
      const db = database(scenario === "cadenceSkip" ? new Date(1_792_454_400_001) : null);
      let clock = 60_000; // Worst nominal phase delay after a synchronized occurrence.
      let tickStart = 0;
      let retried = 0;
      let deferrals = 0;
      let maxDuration = 0;
      let maxInFlight = 0;
      let inFlight = 0;
      const progress: number[][] = [];
      const providerAcceptedKeys = [new Set<number>(), new Set<number>()];
      const firstWait: number[] = [];
      const latency = scenario === "timeout" ? 8_150 : scenario === "immediate" ? 150 : scenario === "remoteDb" || scenario === "cadenceSkip" ? 1_200 : 400;
      const drain = (queue: number) => async (batchSize: number) => {
        const counts = { claimed: 0, providerAccepted: 0, retryScheduled: 0, deliveryWindowExpired: 0, suppressed: 0, remainingDue: 0 };
        for (const item of queues[queue]) {
          if (queue === 0 && item.state === "pending" && clock > 900_000) { item.state = "expired"; counts.deliveryWindowExpired++; counts.suppressed++; }
        }
        for (let slot = 0; slot < batchSize && clock - tickStart < (scenario === "restart" && tickStart === 60_000 ? 2_000 : 180_000); slot++) {
          const item = queues[queue].filter((row) => ["pending", "retry"].includes(row.state) && row.due <= clock)
            .sort((left, right) => (queue === 0 ? Number(left.attempts > 0) - Number(right.attempts > 0) : 0) || left.due - right.due || left.key - right.key)[0];
          if (!item) break;
          counts.claimed++;
          if (queue === 0 && item.state === "pending" && clock > 900_000) {
            item.state = "expired"; counts.deliveryWindowExpired++; counts.suppressed++; continue;
          }
          if ((scenario === "optOut" || scenario === "unlink") && item.key === Math.floor(size / 2)) {
            item.state = "suppressed"; counts.suppressed++; continue;
          }
          if (item.attempts === 0) { firstWait.push(clock); if (queue === 0) expect(clock).toBeLessThanOrEqual(900_000); }
          else retried++;
          item.attempts++;
          inFlight++; maxInFlight = Math.max(inFlight, maxInFlight);
          clock += latency;
          inFlight--;
          const fail = item.attempts === 1 && (scenario === "429" || scenario === "ambiguous" || scenario === "timeout" || (scenario === "transient" && item.key % 5 === 0));
          if (scenario === "ambiguous" || scenario === "timeout") providerAcceptedKeys[queue].add(item.key);
          if (fail) { item.state = "retry"; item.due = clock + 60_000; counts.retryScheduled++; }
          else { item.state = "accepted"; providerAcceptedKeys[queue].add(item.key); counts.providerAccepted++; }
        }
        counts.remainingDue = queues[queue].filter((item) => ["pending", "retry"].includes(item.state) && item.due <= clock).length;
        return counts;
      };
      for (let tick = 0; tick < 40; tick++) {
        if (tick > 0) clock = (Math.floor(clock / 60_000) + 1) * 60_000;
        tickStart = clock;
        const result = await runNotificationSchedulerTick({ database: db, now: () => new Date(1_792_454_400_000 + clock),
          monotonicNow: () => clock, launchBudgetMs: scenario === "restart" && tick === 0 ? 2_000 : 180_000,
          drainMedication: drain(0), drainAppointment: drain(1), purgeMedication: async () => 0, purgeAppointment: async () => 0, logSummary: () => undefined });
        maxDuration = Math.max(maxDuration, clock - tickStart);
        if (result.status === "SKIPPED") { progress.push([0, 0]); continue; }
        if (result.status === "DEFERRED") deferrals++;
        progress.push([result.steps.medicationDrain.counts.claimed ?? 0, result.steps.appointmentDrain.counts.claimed ?? 0]);
        expect(inFlight).toBe(0);
        if (queues.every((queue) => queue.every((item) => !["pending", "retry"].includes(item.state)))) break;
      }
      const accounting = queues.map((queue) => Object.fromEntries(["accepted", "expired", "suppressed", "pending", "retry"].map((state) => [state, queue.filter((item) => item.state === state).length])));
      for (const counts of accounting) expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(size);
      expect(maxInFlight).toBe(1);
      expect(maxDuration).toBeLessThanOrEqual(188_150);
      expect(accounting.every((counts) => counts.pending === 0 && counts.retry === 0)).toBe(true);
      if (scenario !== "timeout") expect(accounting[0].expired).toBe(0);
      if (scenario === "bounded" || scenario === "immediate" || scenario === "remoteDb" || scenario === "cadenceSkip") expect(accounting.map((counts) => counts.accepted)).toEqual([size, size]);
      if (scenario === "timeout" && size === 200) { expect(accounting[0].expired).toBeGreaterThan(0); expect(progress[0].every((claims) => claims > 0)).toBe(true); }
      if (scenario === "ambiguous") expect(providerAcceptedKeys.map((keys) => keys.size)).toEqual([size, size]);
      process.stdout.write(`${JSON.stringify({ size, scenario, accounting, retried, deferrals, ticks: progress.length, maxDurationMs: maxDuration, maximumFirstWaitMs: Math.max(...firstWait), maxInFlight })}\n`);
    },
  );
});
