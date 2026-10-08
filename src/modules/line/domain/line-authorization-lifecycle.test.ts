import { randomUUID } from "node:crypto";
import type { LineAuthorizationLifecycle } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { isLineObligationSatisfied, isLineRecoveryEligible, lineChannelInventorySchema, lineChannelTupleDefinition, lineChannelTupleKey, lineObligationStatus, type LineChannel } from "./line-authorization-lifecycle";

const now = new Date("2026-10-08T00:00:00Z");
const account: LineChannel = { kind: "ACCOUNT", providerReference: "test-provider", channelId: "1234567890", environment: "ACCOUNT", deploymentReference: "integration" };
function row(overrides: Partial<LineAuthorizationLifecycle> = {}): LineAuthorizationLifecycle {
  return { id: randomUUID(), bindingId: randomUUID(), bindingVersion: 2, tupleKey: lineChannelTupleKey(account), tupleDefinition: lineChannelTupleDefinition(account),
    applicability: "UNKNOWN", evidenceReference: "inventory-v1", observedAt: null,
    remoteOutcome: "REMOTE_UNCONFIRMED", requestedAt: now, confirmedAt: null, reason: "TOKEN_UNAVAILABLE",
    attemptId: null, reservedAt: null, settledAt: null, recoveryReleasedAt: null, recoveryDecisionAuditId: null,
    createdAt: now, updatedAt: now, ...overrides };
}

describe("LINE lifecycle evidence rules", () => {
  it("requires reviewed MINI exclusion for an Account-only inventory", () => {
    expect(lineChannelInventorySchema.safeParse({ revision: "test-v1", channels: [account] }).success).toBe(false);
    expect(lineChannelInventorySchema.safeParse({ revision: "test-v1", channels: [account], miniExclusionReference: "operator-review-v1" }).success).toBe(true);
  });
  it("isolates channel and internal environment tuples", () => {
    const mini: LineChannel = { ...account, kind: "MINI", channelId: "2222222222", environment: "DEVELOPING" };
    expect(new Set([account, mini, { ...mini, environment: "PUBLISHED" as const }].map(lineChannelTupleKey)).size).toBe(3);
    expect(lineChannelTupleKey({ ...account, exclusionReference: "review-v2" })).toBe(lineChannelTupleKey(account));
  });
  it("rejects duplicate tuples, Account exclusions and cross-kind environments", () => {
    for (const channels of [[account, account], [{ ...account, exclusionReference: "review" }], [{ ...account, environment: "DEVELOPING" }]]) {
      expect(lineChannelInventorySchema.safeParse({ revision: "v1", channels, miniExclusionReference: "review" }).success).toBe(false);
    }
  });
  it("never infers absence or success from missing proof or unknown applicability", () => {
    expect(isLineObligationSatisfied(row())).toBe(false);
    expect(lineObligationStatus(row())).toBe("REMOTE_UNCONFIRMED");
    expect(isLineRecoveryEligible(row(), now)).toBe(true);
  });
  it("requires settlement for confirmation and keeps recovery distinct after a late 204", () => {
    expect(isLineObligationSatisfied(row({ remoteOutcome: "REMOTE_CONFIRMED" }))).toBe(false);
    const released = row({ remoteOutcome: "REMOTE_CONFIRMED", settledAt: now, confirmedAt: now, recoveryReleasedAt: now, recoveryDecisionAuditId: randomUUID() });
    expect(isLineObligationSatisfied(released)).toBe(true);
    expect(lineObligationStatus(released)).toBe("RECOVERY_RELEASED_UNVERIFIED");
  });
  it("uses the interactive budget for crashed reservations, never as drain evidence", () => {
    const reserved = row({ attemptId: randomUUID(), reservedAt: now, reason: "ATTEMPT_RESERVED" });
    expect(isLineRecoveryEligible(reserved, new Date(now.getTime() + 9999))).toBe(false);
    expect(isLineRecoveryEligible(reserved, new Date(now.getTime() + 10000))).toBe(true);
    expect(lineObligationStatus(reserved)).toBe("REMOTE_UNCONFIRMED");
    expect(isLineRecoveryEligible({ ...reserved, reason: "POSSIBLY_DISPATCHED" }, now)).toBe(true);
  });
  it("does not release connected observations or already satisfied obligations", () => {
    expect(isLineRecoveryEligible(row({ requestedAt: null, remoteOutcome: "OBSERVED" }), now)).toBe(false);
    expect(isLineRecoveryEligible(row({ applicability: "PROVEN_ABSENT" }), now)).toBe(false);
  });
});
