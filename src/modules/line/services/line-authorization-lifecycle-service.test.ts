import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { authorizeLineRecoveryDecision, evaluateLineRelinkEligibility, releaseLineRecovery, type AuthorizedLineRecoveryDecision, type LineRecoveryCapability } from "./line-authorization-lifecycle-service";
import type { LineChannelInventory } from "../domain/line-authorization-lifecycle";

const now = new Date("2026-10-08T06:00:00Z");
const inventory: LineChannelInventory = { revision: "test-v1", channels: [
  { kind: "ACCOUNT", providerReference: "test-provider", channelId: "1234567890", environment: "ACCOUNT", deploymentReference: "unit-test" },
], miniExclusionReference: "operator-review-test" };
const request: AuthorizedLineRecoveryDecision = {
  ownerUserId: randomUUID(), bindingId: randomUUID(), bindingVersion: 2, intentId: randomUUID(), reviewedSetDigest: "a".repeat(64),
  policyVersion: "LINE_RECOVERY_V1", copyVersion: "LINE_RECOVERY_V1", sessionCheckedAt: now,
  proofTupleKey: "b".repeat(64), proofVerifiedAt: now, proofExpiresAt: new Date(now.getTime() + 60000), manualReviews: {},
};

describe("LINE recovery server capability boundary", () => {
  it.each([false, true])("offers recovery only for a currently revoked binding (revoked=%s)", async (revoked) => {
    const transaction = {
      lineAccountBinding: { findUnique: async () => ({ userId: request.ownerUserId, lifecycleVersion: 2, unlinkedAt: revoked ? now : null }) },
      lineAuthorizationLifecycle: { findMany: async () => [{ bindingVersion: 2, requestedAt: now, applicability: "UNKNOWN", remoteOutcome: "REMOTE_UNCONFIRMED", reason: "TOKEN_UNAVAILABLE", recoveryReleasedAt: null, reservedAt: null }] },
    } as unknown as Prisma.TransactionClient;
    await expect(evaluateLineRelinkEligibility(transaction, request, now)).resolves.toEqual({ eligible: false, blockedCount: 1, recoveryAvailable: revoked });
  });
  it("does not issue a capability when the required trusted verifier rejects", async () => {
    const authorize = vi.fn(async () => { throw new Error("live session/proof denied"); });
    await expect(authorizeLineRecoveryDecision(request, { authorize })).rejects.toThrow("live session/proof denied");
    expect(authorize).toHaveBeenCalledOnce();
  });
  it("rejects fabricated authority flags before touching a transaction", async () => {
    const query = vi.fn();
    const transaction = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    await expect(releaseLineRecovery(transaction, { verified: true } as unknown as LineRecoveryCapability, inventory, now)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("cannot serialize a trusted capability into a reusable client credential", async () => {
    const capability = await authorizeLineRecoveryDecision(request, { authorize: async (decision) => ({
      decision, sessionHash: "a".repeat(64), challengeHash: "b".repeat(64), fingerprint: "c".repeat(64), fingerprintKeyId: "test-key",
      riskAcknowledgedAt: now,
    }) });
    const serialized = JSON.stringify(capability);
    expect(serialized).toBe("{}");
    await expect(releaseLineRecovery({} as Prisma.TransactionClient, JSON.parse(serialized) as LineRecoveryCapability, inventory, now)).rejects.toThrow();
  });
});
