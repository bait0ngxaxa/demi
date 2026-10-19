import { createHash, randomUUID } from "node:crypto";
import type { LineAuthorizationLifecycle } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { isLineObligationSatisfied, isLineRecoveryEligible, lineChannelDisplayName, lineChannelInventorySchema, lineChannelTupleDefinition, lineChannelTupleKey, lineObligationSetDigest, lineObligationStatus, type LineChannel } from "./line-authorization-lifecycle";

const now = new Date("2026-10-08T00:00:00Z");
const account: LineChannel = { kind: "ACCOUNT", channelId: "1234567890", environment: "ACCOUNT" };
const mini: LineChannel = { kind: "MINI", channelId: "2222222222", environment: "DEVELOPING" };
// Exactly the pre-B2.4 manifest tuple shape; persisted rows keep it verbatim.
const legacyDefinition = JSON.stringify(["synthetic-provider", "MINI", "2222222222", "DEVELOPING", "synthetic-deploy"]);
function row(overrides: Partial<LineAuthorizationLifecycle> = {}): LineAuthorizationLifecycle {
  return { id: randomUUID(), bindingId: randomUUID(), bindingVersion: 2, tupleKey: lineChannelTupleKey(account), tupleDefinition: lineChannelTupleDefinition(account),
    applicability: "UNKNOWN", evidenceReference: "inventory-v1", observedAt: null,
    remoteOutcome: "REMOTE_UNCONFIRMED", requestedAt: now, confirmedAt: null, reason: "TOKEN_UNAVAILABLE",
    attemptId: null, reservedAt: null, settledAt: null, recoveryReleasedAt: null, recoveryDecisionAuditId: null,
    createdAt: now, updatedAt: now, ...overrides };
}

describe("LINE lifecycle evidence rules", () => {
  it("accepts Account-only and Account + one MINI inventories without operator evidence", () => {
    expect(lineChannelInventorySchema.safeParse({ channels: [account] }).success).toBe(true);
    expect(lineChannelInventorySchema.safeParse({ channels: [account, mini] }).success).toBe(true);
  });
  it("isolates channel and internal environment tuples", () => {
    expect(new Set([account, mini, { ...mini, environment: "PUBLISHED" as const }].map(lineChannelTupleKey)).size).toBe(3);
    expect(lineChannelTupleDefinition(mini)).toBe(JSON.stringify(["LINE_CHANNEL_V2", "MINI", "2222222222", "DEVELOPING", "server-config"]));
  });
  it("rejects missing/duplicate Account, shared channel IDs, extra MINI, cross-kind environments and legacy fields", () => {
    for (const channels of [[mini], [account, account], [account, { ...mini, channelId: account.channelId }],
      [account, mini, { ...mini, channelId: "3333333333" }], [{ ...account, environment: "DEVELOPING" }],
      [{ ...account, providerReference: "provider" }]]) {
      expect(lineChannelInventorySchema.safeParse({ channels }).success).toBe(false);
    }
    expect(lineChannelInventorySchema.safeParse({ revision: "v1", channels: [account] }).success).toBe(false);
  });
  it("labels current and pre-B2.4 persisted tuple definitions without remapping their keys", () => {
    expect(lineChannelDisplayName(lineChannelTupleDefinition(account))).toBe("LINE Login ของ DEMI");
    expect(lineChannelDisplayName(legacyDefinition)).toBe("DEMI MINI App");
    expect(lineChannelDisplayName("not-json")).toBe("แอป DEMI ที่เคยเชื่อมต่อ");
    // A new key never collides with the pre-B2.4 key of the same channel, so legacy rows stay distinct history.
    expect(lineChannelTupleKey(mini)).not.toBe(createHash("sha256").update(legacyDefinition).digest("hex"));
  });
  it("binds the reviewed obligation set to the derived inventory", () => {
    const rows = [row()];
    expect(lineObligationSetDigest(rows, { channels: [account] })).not.toBe(lineObligationSetDigest(rows, { channels: [account, mini] }));
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
