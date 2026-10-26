import { describe, expect, it, vi } from "vitest";

import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import { createLineWorkflowRateLimiter, getLineWorkflowRateLimitRetryAfter, LINE_WORKFLOW_RATE_LIMITS, lineWorkflowRateLimitInternals } from "./line-workflow-rate-limit";

const NOW = new Date("2026-10-18T03:02:34.567Z");
const USER_ID = "11111111-1111-4111-8111-111111111111";

function database(hitCount = 1) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([{ hitCount }]),
  };
}

describe("PostgreSQL shared MINI workflow rate limiter", () => {
  it("keeps dedicated account-status quotas separate and calculates the fixed-window retry boundary", () => {
    expect(LINE_WORKFLOW_RATE_LIMITS).toMatchObject({ ACCOUNT_STATUS_USER: 6, ACCOUNT_STATUS_GLOBAL: 600, VERIFY_USER: 10, VERIFY_GLOBAL: 600, ACKNOWLEDGE: 60, CANCELLATION_REQUEST: 20 });
    expect(getLineWorkflowRateLimitRetryAfter(new Date("2026-10-26T03:00:00Z"))).toBe(300);
    expect(getLineWorkflowRateLimitRetryAfter(new Date("2026-10-26T03:04:59.999Z"))).toBe(1);
  });
  it("uses fixed five-minute windows and a bounded expiration", async () => {
    const db = database();
    const limiter = createLineWorkflowRateLimiter(db as never);

    await expect(limiter.consume("VERIFY_USER", USER_ID, NOW)).resolves.toBe(true);
    const call = db.$queryRaw.mock.calls[0];
    const values = call.slice(1);
    const expectedWindow = lineWorkflowRateLimitInternals.rateLimitWindow(NOW);
    expect(values[0]).toBe("VERIFY_USER");
    expect(values[1]).toMatch(/^[a-f0-9]{64}$/u);
    expect(values[1]).not.toContain(USER_ID);
    expect(values[2]).toEqual(expectedWindow.startsAt);
    expect(values[3]).toEqual(expectedWindow.expiresAt);
    expect(expectedWindow.expiresAt.getTime() - expectedWindow.startsAt.getTime()).toBe(600_000);
    expect(call[0].join("")).toContain("ON CONFLICT");
    expect(call[0].join("")).toContain("LEAST");
    expect(db.$executeRaw).toHaveBeenCalledOnce();
  });

  it("denies at the quota while saturating the counter", async () => {
    const db = database(601);
    const limiter = createLineWorkflowRateLimiter(db as never);
    await expect(limiter.consume("VERIFY_GLOBAL", "GLOBAL", NOW)).resolves.toBe(false);
    expect(db.$queryRaw.mock.calls[0].slice(1)).toContain(601);
  });

  it("fails closed when PostgreSQL cleanup or counter writes fail", async () => {
    const db = database();
    db.$executeRaw.mockRejectedValue(new Error("database unavailable"));
    const limiter = createLineWorkflowRateLimiter(db as never);
    const error = await limiter.consume("ACKNOWLEDGE", USER_ID, NOW).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LineWorkflowFailure);
    expect((error as LineWorkflowFailure).code).toBe("INFRASTRUCTURE_UNAVAILABLE");
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("fails closed for status checks when the atomic counter write fails", async () => {
    const db = database(); db.$queryRaw.mockRejectedValue(new Error("private counter failure"));
    await expect(createLineWorkflowRateLimiter(db as never).consume("ACCOUNT_STATUS_USER", USER_ID, NOW))
      .rejects.toMatchObject({ code: "INFRASTRUCTURE_UNAVAILABLE" });
  });
});
