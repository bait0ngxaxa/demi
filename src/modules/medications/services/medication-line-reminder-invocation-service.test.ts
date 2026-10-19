import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dedicated = "m".repeat(40);
const shared = "a".repeat(40);
const now = new Date("2026-10-19T08:00:00.000Z");

function fakeDatabase(): PrismaClient {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ lastInvocationAt: new Date(0) }]),
    medicationLineReminderWorkerState: { update: vi.fn().mockResolvedValue({}) },
  };
  return { $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(transaction)) } as unknown as PrismaClient;
}

async function load() {
  vi.resetModules();
  return import("./medication-line-reminder-invocation-service");
}

async function signedHeaders(secret: string) {
  const { signMedicationLineReminderInvocation } = await load();
  const timestamp = String(now.getTime());
  const nonce = randomUUID();
  return { timestamp, nonce, signature: signMedicationLineReminderInvocation({ timestamp, nonce, secret }) };
}

describe("medication reminder worker secret", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET", undefined);
    vi.stubEnv("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("verifies with the dedicated secret and rejects the shared one while it is set", async () => {
    vi.stubEnv("DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET", dedicated);
    vi.stubEnv("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET", shared);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const accepted = await signedHeaders(dedicated);
    const rejected = await signedHeaders(shared);
    const { verifyAndConsumeMedicationLineReminderInvocation } = await load();
    await expect(verifyAndConsumeMedicationLineReminderInvocation(accepted, { now, database: fakeDatabase() })).resolves.toBeUndefined();
    await expect(verifyAndConsumeMedicationLineReminderInvocation(rejected, { now, database: fakeDatabase() })).rejects.toMatchObject({ name: "ForbiddenError" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not fall back when the dedicated secret is set but invalid", async () => {
    vi.stubEnv("DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET", "too-short");
    vi.stubEnv("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET", shared);
    const headers = await signedHeaders(shared);
    const { verifyAndConsumeMedicationLineReminderInvocation } = await load();
    await expect(verifyAndConsumeMedicationLineReminderInvocation(headers, { now, database: fakeDatabase() })).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it.each([undefined, ""])("accepts the shared secret with a one-time warning when the dedicated secret is %j", async (value) => {
    vi.stubEnv("DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET", value);
    vi.stubEnv("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET", shared);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = await signedHeaders(shared);
    const second = await signedHeaders(shared);
    const { verifyAndConsumeMedicationLineReminderInvocation } = await load();
    await expect(verifyAndConsumeMedicationLineReminderInvocation(first, { now, database: fakeDatabase() })).resolves.toBeUndefined();
    await expect(verifyAndConsumeMedicationLineReminderInvocation(second, { now, database: fakeDatabase() })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("medication_line_reminder_worker_config", { warning: "LEGACY_SHARED_WORKER_SECRET_IN_USE" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(shared);
  });

  it("fails closed without warning when neither secret is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const headers = await signedHeaders(shared);
    const { verifyAndConsumeMedicationLineReminderInvocation } = await load();
    await expect(verifyAndConsumeMedicationLineReminderInvocation(headers, { now, database: fakeDatabase() })).rejects.toMatchObject({ name: "ForbiddenError" });
    expect(warn).not.toHaveBeenCalled();
  });
});
