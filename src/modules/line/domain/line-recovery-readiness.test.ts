import { describe, expect, it } from "vitest";

import { resolveLineRecoveryReadiness } from "./line-recovery-readiness";

const now = new Date("2026-10-26T05:00:00.000Z");

describe("LINE password recovery readiness", () => {
  it("reports unlinked accounts separately while keeping linking optional", () => {
    expect(resolveLineRecoveryReadiness({
      accountStatus: "UNLINKED",
      reachability: null,
      reachabilityObservedAt: null,
      recoveryConfigured: true,
      now,
    })).toEqual({ status: "UNLINKED", recoveryConfigured: true });
  });

  it("reports recovery delivery ready only for a recently verified friendship and complete configuration", () => {
    const observedAt = new Date("2026-10-25T12:00:00.000Z");
    expect(resolveLineRecoveryReadiness({
      accountStatus: "LINKED",
      reachability: "FRIEND",
      reachabilityObservedAt: observedAt,
      recoveryConfigured: true,
      now,
    })).toEqual({ status: "READY", recoveryConfigured: true, observedAt: observedAt.toISOString() });
  });

  it.each([
    ["missing observation", "FRIEND", null, "FRIENDSHIP_UNCONFIRMED"],
    ["unknown friendship", "UNKNOWN", now, "FRIENDSHIP_UNCONFIRMED"],
    ["verified non-friend", "NOT_FRIEND", now, "FRIENDSHIP_UNCONFIRMED"],
    ["stale friendship", "FRIEND", new Date("2026-10-24T00:00:00.000Z"), "STALE_OBSERVATION"],
    ["future friendship timestamp", "FRIEND", new Date("2026-10-26T05:01:00.000Z"), "STALE_OBSERVATION"],
    ["invalid friendship timestamp", "FRIEND", new Date("invalid"), "STALE_OBSERVATION"],
  ] as const)("does not report %s as recovery ready", (_label, reachability, reachabilityObservedAt, reason) => {
    expect(resolveLineRecoveryReadiness({
      accountStatus: "LINKED",
      reachability,
      reachabilityObservedAt,
      recoveryConfigured: true,
      now,
    })).toMatchObject({ status: "UNCONFIRMED", reason });
  });

  it("reports known local recovery configuration failure without probing LINE", () => {
    expect(resolveLineRecoveryReadiness({
      accountStatus: "LINKED",
      reachability: "FRIEND",
      reachabilityObservedAt: now,
      recoveryConfigured: false,
      now,
    })).toEqual({ status: "UNAVAILABLE", recoveryConfigured: false });
  });
});
