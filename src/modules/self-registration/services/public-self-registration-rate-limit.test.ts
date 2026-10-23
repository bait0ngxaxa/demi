import { describe, expect, it, vi } from "vitest";

import { InfrastructureError } from "@/shared/errors/application-error";

import {
  createPublicSelfRegistrationRateLimiter,
  PUBLIC_SELF_REGISTRATION_RATE_LIMITS,
  publicSelfRegistrationRateLimitInternals,
} from "./public-self-registration-rate-limit";

const NOW = new Date("2026-10-22T03:02:34.567Z");

function database(hitCount = 1) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([{ hitCount }]),
  };
}

describe("persisted public self-registration rate limits", () => {
  it.each(["IP", "IDENTITY", "INVITATION", "GLOBAL", "CG_PATIENT", "CG_IDENTITY"] as const)("stores only an HMAC key for %s buckets", async (category) => {
    const db = database();
    const limiter = createPublicSelfRegistrationRateLimiter(db as never, "a-test-only-secret-with-at-least-32-chars");
    const principal = category === "IP" ? "203.0.113.9" : category === "GLOBAL" ? "GLOBAL" : `${category.toLowerCase()}-principal-hash`;

    await expect(limiter.consume(category, principal, NOW)).resolves.toBe(true);
    const call = db.$queryRaw.mock.calls[0];
    const values = call?.slice(1) ?? [];
    const expectedWindow = publicSelfRegistrationRateLimitInternals.rateLimitWindow(category, NOW);
    expect(values[0]).toBe(category);
    expect(values[1]).toMatch(/^[a-f0-9]{64}$/u);
    expect(values[1]).not.toContain(principal);
    expect(values[2]).toEqual(expectedWindow.startsAt);
    expect(values[3]).toEqual(expectedWindow.expiresAt);
    expect(values[4]).toBe(PUBLIC_SELF_REGISTRATION_RATE_LIMITS[category].limit + 1);
    expect(call?.[0].join("")).toContain("ON CONFLICT");
    expect(call?.[0].join("")).toContain("LEAST");
  });

  it.each(["IP", "IDENTITY", "INVITATION", "GLOBAL", "CG_PATIENT", "CG_IDENTITY"] as const)("denies %s requests after the fixed-window quota", async (category) => {
    const limit = PUBLIC_SELF_REGISTRATION_RATE_LIMITS[category].limit;
    const db = database(limit + 1);
    const limiter = createPublicSelfRegistrationRateLimiter(db as never, "a-test-only-secret-with-at-least-32-chars");

    await expect(limiter.consume(category, "principal", NOW)).resolves.toBe(false);
    expect(db.$queryRaw.mock.calls[0]?.slice(1)).toContain(limit + 1);
    expect(publicSelfRegistrationRateLimitInternals.rateLimitWindow(category, new Date(NOW.getTime() + PUBLIC_SELF_REGISTRATION_RATE_LIMITS[category].windowMs)).startsAt)
      .not.toEqual(publicSelfRegistrationRateLimitInternals.rateLimitWindow(category, NOW).startsAt);
  });

  it("fails closed if cleanup or bucket persistence is unavailable", async () => {
    const db = database();
    db.$executeRaw.mockRejectedValue(new Error("database unavailable"));
    const limiter = createPublicSelfRegistrationRateLimiter(db as never, "a-test-only-secret-with-at-least-32-chars");

    await expect(limiter.consume("IP", "203.0.113.9", NOW)).rejects.toBeInstanceOf(InfrastructureError);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("limits caregiver invitation creation to ten attempts per day by patient and recipient hash", () => {
    expect(PUBLIC_SELF_REGISTRATION_RATE_LIMITS.CG_PATIENT).toEqual({ limit: 10, windowMs: 24 * 60 * 60 * 1000 });
    expect(PUBLIC_SELF_REGISTRATION_RATE_LIMITS.CG_IDENTITY).toEqual({ limit: 10, windowMs: 24 * 60 * 60 * 1000 });
  });
});
