import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readiness: vi.fn() }));
vi.mock("@/modules/notification-scheduler/services/notification-scheduler-readiness-service", () => ({
  getNotificationSchedulerReadiness: mocks.readiness,
}));

import { GET } from "./route";

const secret = "s".repeat(40);
const request = (authorization?: string) => new Request("https://demi.example.org/api/internal/scheduler/readiness", {
  headers: authorization === undefined ? {} : { authorization },
});

describe("GET /api/internal/scheduler/readiness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DEMI_SCHEDULER_SECRET", secret);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns 404 without the scheduler bearer", async () => {
    expect((await GET(request())).status).toBe(404);
    expect((await GET(request("Bearer wrong"))).status).toBe(404);
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it("returns a healthy readiness view with no-store", async () => {
    const view = { healthy: true, lastTickAgeSeconds: 1, lastTickStatus: "COMPLETED", lastTickCompletedAt: "2026-10-19T08:00:00.000Z", outboxes: { appointmentLineNotifications: { pending: 0, oldestPendingAgeSeconds: null }, medicationLineReminders: { pending: 2, oldestPendingAgeSeconds: 61 } } };
    mocks.readiness.mockResolvedValue(view);
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(view);
  });

  it("returns 503 immediately when the latest tick is deferred despite a recent successful tick", async () => {
    const view = { healthy: false, lastTickAgeSeconds: 301, lastTickStatus: "DEFERRED", lastTickCompletedAt: "2026-10-19T08:00:00.000Z", outboxes: { appointmentLineNotifications: { pending: 0, oldestPendingAgeSeconds: null }, medicationLineReminders: { pending: 0, oldestPendingAgeSeconds: null } } };
    mocks.readiness.mockResolvedValue(view);
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(view);
  });

  it("returns a generic 503 when the read fails", async () => {
    mocks.readiness.mockRejectedValue(new Error("private database error"));
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
});
