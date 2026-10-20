import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tick: vi.fn() }));
vi.mock("@/modules/notification-scheduler/services/notification-scheduler-tick-service", () => ({
  runNotificationSchedulerTick: mocks.tick,
}));

import { GET, maxDuration } from "./route";

const secret = "s".repeat(40);

function request(authorization?: string): Request {
  return new Request("https://demi.example.org/api/internal/scheduler/tick", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("GET /api/internal/scheduler/tick", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DEMI_SCHEDULER_SECRET", secret);
    vi.stubEnv("CRON_SECRET", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "", `Bearer ${"x".repeat(40)}`, secret])("returns 404 without running for authorization %j", async (authorization) => {
    const response = await GET(request(authorization));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.tick).not.toHaveBeenCalled();
  });

  it("returns 404 when no scheduler secret is configured", async () => {
    vi.stubEnv("DEMI_SCHEDULER_SECRET", undefined);
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(404);
    expect(mocks.tick).not.toHaveBeenCalled();
  });

  it("runs the tick for the exact bearer and returns its aggregate result", async () => {
    mocks.tick.mockResolvedValue({ status: "SKIPPED", reason: "LOCK_BUSY" });
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "SKIPPED", reason: "LOCK_BUSY" });
  });

  it("returns HTTP 200 with an explicit failed step for the caller to classify", async () => {
    const failed = {
      status: "FAILED",
      durationMs: 12,
      steps: {
        medicationDrain: { status: "COMPLETED", batches: 1, counts: { claimed: 2 } },
        appointmentDrain: { status: "FAILED", batches: 0, counts: {} },
        appointmentPurge: { status: "COMPLETED", batches: 1, counts: { deleted: 0 } },
        medicationPurge: { status: "COMPLETED", batches: 1, counts: { deleted: 0 } },
      },
    };
    mocks.tick.mockResolvedValue(failed);
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(failed);
  });

  it("accepts the CRON_SECRET bearer when the dedicated secret is unset", async () => {
    vi.stubEnv("DEMI_SCHEDULER_SECRET", undefined);
    vi.stubEnv("CRON_SECRET", secret);
    mocks.tick.mockResolvedValue({ status: "SKIPPED", reason: "TOO_SOON" });
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(200);
  });

  it("returns a generic 503 when the tick fails", async () => {
    mocks.tick.mockRejectedValue(new Error("private database error"));
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });

  it("bounds the function duration", () => {
    expect(maxDuration).toBe(300);
  });
});
