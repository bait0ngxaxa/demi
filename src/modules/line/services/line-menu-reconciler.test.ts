import { describe, expect, it } from "vitest";

import { lineMenuReconcilerInternals } from "./line-menu-reconciler";

describe("LINE provider cleanup retry schedule", () => {
  it("uses stable per-binding jitter around an exponential delay", () => {
    const bindingId = "6eea2f03-f166-4b7b-82a7-70c9e5cde6d8";
    const delay = lineMenuReconcilerInternals.cleanupRetryDelayMs;
    const firstAttempt = delay(bindingId, 1);
    const secondAttempt = delay(bindingId, 2);

    expect(firstAttempt).toBe(delay(bindingId, 1));
    expect(firstAttempt).toBeGreaterThanOrEqual(48_000);
    expect(firstAttempt).toBeLessThanOrEqual(72_000);
    expect(secondAttempt).toBeGreaterThanOrEqual(96_000);
    expect(secondAttempt).toBeLessThanOrEqual(144_000);
    expect(secondAttempt).toBeGreaterThan(firstAttempt);
  });

  it("caps the retry delay at 24 hours", () => {
    const delay = lineMenuReconcilerInternals.cleanupRetryDelayMs;

    expect(delay("6eea2f03-f166-4b7b-82a7-70c9e5cde6d8", 30)).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(delay("6eea2f03-f166-4b7b-82a7-70c9e5cde6d8", 30)).toBeGreaterThan(0);
  });
});
