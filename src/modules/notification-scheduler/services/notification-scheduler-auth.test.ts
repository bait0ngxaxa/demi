import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isAuthorizedNotificationSchedulerRequest,
  resolveNotificationSchedulerSecret,
} from "./notification-scheduler-auth";

const dedicated = "d".repeat(40);
const cron = "c".repeat(40);

describe("notification scheduler bearer authentication", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_SCHEDULER_SECRET", undefined);
    vi.stubEnv("CRON_SECRET", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when no secret is configured", () => {
    expect(resolveNotificationSchedulerSecret()).toBeNull();
    expect(isAuthorizedNotificationSchedulerRequest("Bearer ")).toBe(false);
    expect(isAuthorizedNotificationSchedulerRequest(null)).toBe(false);
  });

  it("accepts only the exact bearer of the dedicated secret", () => {
    vi.stubEnv("DEMI_SCHEDULER_SECRET", dedicated);
    vi.stubEnv("CRON_SECRET", cron);
    expect(isAuthorizedNotificationSchedulerRequest(`Bearer ${dedicated}`)).toBe(true);
    for (const header of [null, "", dedicated, `bearer ${dedicated}`, `Bearer  ${dedicated}`, `Bearer ${dedicated} `, `Bearer ${cron}`, `Basic ${dedicated}`]) {
      expect(isAuthorizedNotificationSchedulerRequest(header)).toBe(false);
    }
  });

  it.each([undefined, "", "   "])("falls back to CRON_SECRET when the dedicated secret is %j", (value) => {
    vi.stubEnv("DEMI_SCHEDULER_SECRET", value);
    vi.stubEnv("CRON_SECRET", cron);
    expect(isAuthorizedNotificationSchedulerRequest(`Bearer ${cron}`)).toBe(true);
  });

  it("does not fall back when the dedicated secret is set but too short", () => {
    vi.stubEnv("DEMI_SCHEDULER_SECRET", "short-secret");
    vi.stubEnv("CRON_SECRET", cron);
    expect(resolveNotificationSchedulerSecret()).toBeNull();
    expect(isAuthorizedNotificationSchedulerRequest(`Bearer ${cron}`)).toBe(false);
    expect(isAuthorizedNotificationSchedulerRequest("Bearer short-secret")).toBe(false);
  });

  it("requires at least 32 characters for CRON_SECRET too", () => {
    vi.stubEnv("CRON_SECRET", "c".repeat(31));
    expect(isAuthorizedNotificationSchedulerRequest(`Bearer ${"c".repeat(31)}`)).toBe(false);
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    expect(isAuthorizedNotificationSchedulerRequest(`Bearer ${"c".repeat(32)}`)).toBe(true);
  });
});
