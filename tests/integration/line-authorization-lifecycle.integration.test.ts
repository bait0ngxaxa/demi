import { createHash, randomUUID } from "node:crypto";
import { LineAccountAction, Prisma, type LineAccountBinding } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { createLineAccountIntent, linkLineAccount, unlinkLineAccount } from "@/modules/line/services/line-account-service";
import { createLineSubjectFingerprint } from "@/modules/line/services/line-identity-fingerprint";
import { lineChannelTupleDefinition, lineChannelTupleKey, lineObligationStatus, type LineChannelInventory } from "@/modules/line/domain/line-authorization-lifecycle";
import {
  authorizeLineRecoveryDecision, evaluateLineRelinkEligibility, initializeLineTermination, isLineTerminationDispatchAllowed, observeLineAuthorization, prepareLineRecoverySet,
  recordLineTerminationOutcome, releaseLineRecovery, reserveLineTerminationAttempt,
  type AuthorizedLineRecoveryDecision, type LineLifecycleTarget, type LineRecoveryAuthority,
} from "@/modules/line/services/line-authorization-lifecycle-service";

const database = getPrisma();
const people: string[] = [];
const users: string[] = [];
const now = new Date("2026-10-08T06:00:00Z");
const sessionHash = "a".repeat(64);
const inventory: LineChannelInventory = { revision: "integration-v1", channels: [
  { kind: "ACCOUNT", providerReference: "test-provider", channelId: "1234567890", environment: "ACCOUNT", deploymentReference: "integration" },
  { kind: "MINI", providerReference: "test-provider", channelId: "2222222222", environment: "DEVELOPING", deploymentReference: "integration" },
] };
const account = lineChannelTupleKey(inventory.channels[0]);
const mini = lineChannelTupleKey(inventory.channels[1]);
const subject = `U${"1".repeat(32)}`;

function target(binding: LineAccountBinding): LineLifecycleTarget {
  return { ownerUserId: binding.userId, bindingId: binding.id, bindingVersion: binding.lifecycleVersion };
}
async function fixture(): Promise<LineAccountBinding> {
  const person = await database.person.create({ data: { identityKeyHash: createHash("sha256").update(randomUUID()).digest("hex"), givenName: "ทดสอบ", familyName: "Lifecycle" } });
  people.push(person.id);
  const user = await database.user.create({ data: { personId: person.id, authSubject: randomUUID(), status: "ACTIVE" } });
  users.push(user.id);
  const fingerprint = createLineSubjectFingerprint(subject);
  return database.lineAccountBinding.create({ data: { userId: user.id, lineUserId: subject, lineSubjectFingerprint: fingerprint.fingerprint,
    lineSubjectFingerprintKeyId: fingerprint.keyId } });
}
function deps(binding: LineAccountBinding, staged = true) {
  return { database, now: () => now, currentSession: async () => ({ userId: binding.userId, sessionHash }),
    verifyIdentity: async () => ({ subject }), ...(staged ? { authorizationInventory: inventory } : {}) };
}
async function unlink(binding: LineAccountBinding): Promise<LineAccountBinding> {
  const intent = await createLineAccountIntent(LineAccountAction.UNLINK, deps(binding));
  await unlinkLineAccount(intent, deps(binding));
  return database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
}
async function rows(binding: LineAccountBinding) {
  return database.lineAuthorizationLifecycle.findMany({ where: { bindingId: binding.id }, orderBy: [{ bindingVersion: "asc" }, { tupleKey: "asc" }] });
}
function tx<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return runSerializableTransaction(database, operation);
}
async function recovery(binding: LineAccountBinding): Promise<AuthorizedLineRecoveryDecision> {
  const set = await tx((transaction) => prepareLineRecoverySet(transaction, target(binding), inventory, now));
  const intent = await database.lineAccountActionIntent.create({ data: { userId: binding.userId, action: "RECOVERY",
    challengeHash: "b".repeat(64), sessionHash, createdAt: now, expiresAt: new Date(now.getTime() + 300000),
    targetBindingId: binding.id, targetBindingVersion: binding.lifecycleVersion, reviewedSetDigest: set.reviewedSetDigest } });
  return { ...target(binding), intentId: intent.id, reviewedSetDigest: set.reviewedSetDigest, policyVersion: "LINE_RECOVERY_V1", copyVersion: "LINE_RECOVERY_V1",
    sessionCheckedAt: now, proofTupleKey: account, proofVerifiedAt: now, proofExpiresAt: new Date(now.getTime() + 60000),
    manualReviews: Object.fromEntries(set.rowIds.map((id) => [id, "UNDETERMINED" as const])) };
}
// Explicit trusted test authority; no production implementation/route exists in this slice.
const authority: LineRecoveryAuthority = { authorize: async (decision) => {
  const fingerprint = createLineSubjectFingerprint(subject);
  return { decision, sessionHash, challengeHash: "b".repeat(64), fingerprint: fingerprint.fingerprint,
    fingerprintKeyId: fingerprint.keyId, riskAcknowledgedAt: now };
} };
async function release(decision: AuthorizedLineRecoveryDecision, selectedInventory = inventory, selectedAuthority = authority): Promise<string> {
  const capability = await authorizeLineRecoveryDecision(decision, selectedAuthority);
  return tx((transaction) => releaseLineRecovery(transaction, capability, selectedInventory, now));
}

function barrier(): { promise: Promise<void>; resolve: () => void } {
  let resolveBarrier: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { resolveBarrier = resolve; });
  return { promise, resolve: resolveBarrier };
}
async function waitForLockWait(minWaiters = 1): Promise<void> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const waiting = await database.$queryRaw<Array<{ waiters: number }>>`SELECT COUNT(*)::integer AS waiters
      FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'`;
    if ((waiting[0]?.waiters ?? 0) >= minWaiters) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Expected a PostgreSQL lock waiter");
}

describe("Phase 17J.3C durable lifecycle PostgreSQL foundation", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Local disposable PostgreSQL required");
    await database.$connect();
  });
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });
  afterEach(async () => {
    await database.lineAuthorizationLifecycle.deleteMany({ where: { binding: { userId: { in: users } } } });
    await database.lineAccountActionIntent.deleteMany({ where: { userId: { in: users } } });
    await database.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await database.lineAccountBinding.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.person.deleteMany({ where: { id: { in: people } } });
    users.splice(0); people.splice(0); vi.unstubAllEnvs();
  });
  afterAll(async () => database.$disconnect());

  it("atomically revokes a legacy binding, advances once, consumes intent and audits unknown Account/MINI obligations", async () => {
    const binding = await fixture();
    const verifyIdentity = vi.fn(async () => { throw new Error("provider unavailable"); });
    const verifyFriendship = vi.fn(async () => { throw new Error("provider unavailable"); });
    const dependencies = { ...deps(binding), verifyIdentity, verifyFriendship };
    const intent = await createLineAccountIntent(LineAccountAction.UNLINK, dependencies);
    await unlinkLineAccount(intent, dependencies);
    expect(verifyIdentity).not.toHaveBeenCalled(); expect(verifyFriendship).not.toHaveBeenCalled();
    const revoked = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(revoked.lifecycleVersion).toBe(2); expect(revoked.unlinkedAt).toEqual(now);
    expect((await rows(binding)).map((row) => [row.applicability, row.remoteOutcome])).toEqual([
      ["UNKNOWN", "REMOTE_UNCONFIRMED"], ["UNKNOWN", "REMOTE_UNCONFIRMED"],
    ]);
    expect(await database.lineAccountActionIntent.findUniqueOrThrow({ where: { id: intent.intentId } })).toMatchObject({ consumedAt: now, outcome: "SUCCEEDED" });
    expect(await database.auditEvent.count({ where: { actorUserId: binding.userId } })).toBe(2);
    expect((await database.user.findUniqueOrThrow({ where: { id: binding.userId } })).status).toBe("ACTIVE");
    const audit = await database.auditEvent.findMany({ where: { actorUserId: binding.userId } });
    expect(JSON.stringify(audit)).not.toContain(sessionHash); expect(JSON.stringify(audit)).not.toContain(subject);
    await expect(unlinkLineAccount(intent, deps(binding))).rejects.toThrow();
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).lifecycleVersion).toBe(2);
  });

  it("keeps the production legacy flow usable without activating lifecycle restrictions", async () => {
    const binding = await fixture(); const dependencies = deps(binding, false);
    const intent = await createLineAccountIntent("UNLINK", dependencies);
    await unlinkLineAccount(intent, dependencies);
    expect(await rows(binding)).toHaveLength(0);
    const linkIntent = await createLineAccountIntent("LINK", dependencies);
    expect(await linkLineAccount({ ...linkIntent, idToken: "test-proof" }, dependencies)).toMatchObject({ status: "LINKED", lifecycleVersion: 3 });
    await expect(createLineAccountIntent("RECOVERY", dependencies)).rejects.toThrow();
  });

  it("rolls back binding, intent, obligations and audit together on invalid inventory", async () => {
    const binding = await fixture(); const intent = await createLineAccountIntent("UNLINK", deps(binding));
    const invalidInventory = { ...inventory, channels: [] };
    await expect(unlinkLineAccount(intent, { ...deps(binding), authorizationInventory: invalidInventory })).rejects.toThrow();
    expect(await rows(binding)).toHaveLength(0);
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).toMatchObject({ lifecycleVersion: 1, unlinkedAt: null });
    expect((await database.lineAccountActionIntent.findUniqueOrThrow({ where: { id: intent.intentId } })).consumedAt).toBeNull();
    expect(await database.auditEvent.count({ where: { actorUserId: binding.userId } })).toBe(0);
  });

  it("creates only Account obligations with reviewed never-provisioned MINI exclusion", async () => {
    const binding = await fixture(); const accountOnly: LineChannelInventory = { revision: "reviewed-v1", channels: [inventory.channels[0]], miniExclusionReference: "operator-never-provisioned-v1" };
    const dependencies = { ...deps(binding), authorizationInventory: accountOnly };
    const intent = await createLineAccountIntent("UNLINK", dependencies);
    await unlinkLineAccount(intent, dependencies);
    expect(await rows(binding)).toHaveLength(1);
    expect((await rows(binding))[0].tupleKey).toBe(account);
  });

  it("copies trusted MINI observation and keeps provisioned unobserved grants unknown", async () => {
    const binding = await fixture();
    await tx((transaction) => observeLineAuthorization(transaction, target(binding), inventory, mini, now));
    const revoked = await unlink(binding);
    expect((await rows(binding)).filter((row) => row.bindingVersion === revoked.lifecycleVersion).find((row) => row.tupleKey === mini)?.applicability).toBe("OBSERVED");
    await expect(tx((transaction) => observeLineAuthorization(transaction, target(binding), inventory, account, now))).rejects.toThrow();
    const revised = { ...inventory, channels: [{ ...inventory.channels[0] }, { ...inventory.channels[1], exclusionReference: "reviewed-excluded" }] };
    await tx((transaction) => initializeLineTermination(transaction, revoked, revised, now));
    expect((await rows(binding)).find((row) => row.bindingVersion === 2 && row.tupleKey === mini)?.applicability).toBe("OBSERVED");
  });

  it("enforces composite uniqueness, foreign keys, nullable pairs and generation at the database", async () => {
    const binding = await unlink(await fixture()); const row = (await rows(binding))[0];
    const data = { ...row, id: undefined, createdAt: undefined, updatedAt: undefined };
    await expect(database.lineAuthorizationLifecycle.create({ data })).rejects.toMatchObject({ code: "P2002" });
    await expect(database.lineAccountBinding.delete({ where: { id: binding.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(database.lineAuthorizationLifecycle.create({ data: { ...data, bindingId: randomUUID() } })).rejects.toThrow();
    await expect(database.lineAuthorizationLifecycle.update({ where: { id: row.id }, data: { recoveryReleasedAt: now } })).rejects.toThrow();
    await expect(database.lineAuthorizationLifecycle.update({ where: { id: row.id }, data: { remoteOutcome: "REMOTE_CONFIRMED" } })).rejects.toThrow();
    await expect(database.lineAuthorizationLifecycle.create({ data: { ...data, bindingVersion: 100 } })).rejects.toThrow();
    await expect(database.lineAuthorizationLifecycle.update({ where: { id: row.id }, data: { tupleKey: "f".repeat(64) } })).rejects.toThrow();
  });

  it("reserves one attempt under concurrent submission and never reuses the slot", async () => {
    const binding = await unlink(await fixture()); const attemptTarget = { ...target(binding), tupleKey: account };
    const results = await Promise.all([0, 1].map(() => tx((transaction) => reserveLineTerminationAttempt(transaction, attemptTarget, inventory, now))));
    const attempt = results.find((result) => result !== null);
    if (!attempt) throw new Error("Expected one reservation");
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await tx((transaction) => recordLineTerminationOutcome(transaction, attempt, "POSSIBLY_DISPATCHED", now))).toBe(true);
    expect(await tx((transaction) => reserveLineTerminationAttempt(transaction, attemptTarget, inventory, now))).toBeNull();
    expect((await rows(binding)).find((row) => row.tupleKey === account)).toMatchObject({ reason: "POSSIBLY_DISPATCHED", settledAt: null, remoteOutcome: "REMOTE_UNCONFIRMED" });
  });

  it.each(["PROVIDER_REJECTED", "INVALID_RESPONSE", "KNOWN_NOT_DISPATCHED"] as const)("never treats %s as remote confirmation", async (evidence) => {
    const binding = await unlink(await fixture());
    const attempt = await tx((transaction) => reserveLineTerminationAttempt(transaction, { ...target(binding), tupleKey: account }, inventory, now));
    if (!attempt) throw new Error("Expected attempt");
    await tx((transaction) => recordLineTerminationOutcome(transaction, attempt, evidence, now));
    expect(await tx((transaction) => reserveLineTerminationAttempt(transaction, { ...target(binding), tupleKey: account }, inventory, now))).toBeNull();
    expect(await tx((transaction) => isLineTerminationDispatchAllowed(transaction, attempt))).toBe(false);
    expect((await rows(binding)).find((row) => row.tupleKey === account)?.remoteOutcome).toBe("REMOTE_UNCONFIRMED");
    expect((await tx((transaction) => evaluateLineRelinkEligibility(transaction, target(binding)))).eligible).toBe(false);
  });

  it("allows normal release only after each channel has a definitive matching 204", async () => {
    const binding = await unlink(await fixture());
    for (const tupleKey of [account, mini]) {
      const attempt = await tx((transaction) => reserveLineTerminationAttempt(transaction, { ...target(binding), tupleKey }, inventory, now));
      if (!attempt) throw new Error("Expected attempt");
      expect(await tx((transaction) => recordLineTerminationOutcome(transaction, { ...attempt, attemptId: randomUUID() }, "PROVIDER_204", now))).toBe(false);
      await tx((transaction) => recordLineTerminationOutcome(transaction, attempt, "PROVIDER_204", now));
      expect((await tx((transaction) => evaluateLineRelinkEligibility(transaction, target(binding)))).eligible).toBe(tupleKey === mini);
    }
  });

  it("recovery preserves uncertain history, audit and local revocation without minting a binding", async () => {
    const binding = await unlink(await fixture()); const decision = await recovery(binding);
    const auditId = await release(decision);
    expect((await rows(binding)).every((row) => row.remoteOutcome === "REMOTE_UNCONFIRMED" && row.recoveryDecisionAuditId === auditId)).toBe(true);
    expect((await rows(binding)).map(lineObligationStatus)).toEqual(["RECOVERY_RELEASED_UNVERIFIED", "RECOVERY_RELEASED_UNVERIFIED"]);
    expect((await tx((transaction) => evaluateLineRelinkEligibility(transaction, target(binding)))).eligible).toBe(true);
    expect(await database.lineAccountBinding.count({ where: { userId: binding.userId, unlinkedAt: null } })).toBe(0);
    expect(await database.auditEvent.findUniqueOrThrow({ where: { id: auditId } })).toMatchObject({ actorUserId: binding.userId, action: "line.lifecycle.recovery.released" });
    await expect(database.auditEvent.delete({ where: { id: auditId } })).rejects.toMatchObject({ code: "P2003" });
    const releasedRow = (await rows(binding))[0];
    await expect(database.lineAuthorizationLifecycle.update({ where: { id: releasedRow.id }, data: {
      attemptId: randomUUID(), reservedAt: now, reason: "ATTEMPT_RESERVED",
    } })).rejects.toThrow();
    await expect(release(decision)).rejects.toThrow();
  });

  it.each(["wrong-owner", "stale-generation", "incomplete-review", "expired-proof", "changed-inventory", "denied-authority"] as const)("fails closed for recovery %s", async (kind) => {
    const binding = await unlink(await fixture()); const original = await recovery(binding);
    const decision = { ...original };
    if (kind === "wrong-owner") decision.ownerUserId = randomUUID();
    if (kind === "stale-generation") decision.bindingVersion += 1;
    if (kind === "incomplete-review") decision.manualReviews = {};
    if (kind === "expired-proof") decision.proofExpiresAt = now;
    const selectedInventory = kind === "changed-inventory" ? { ...inventory, revision: "new-review-v2" } : inventory;
    const selectedAuthority: LineRecoveryAuthority = kind === "denied-authority" ? { authorize: async () => { throw new Error("trusted verifier denied"); } } : authority;
    await expect(release(decision, selectedInventory, selectedAuthority)).rejects.toThrow();
    expect((await rows(binding)).every((row) => row.recoveryReleasedAt === null)).toBe(true);
    expect((await database.lineAccountActionIntent.findUniqueOrThrow({ where: { id: original.intentId } })).consumedAt).toBeNull();
  });

  it("new unreviewed obligations invalidate a prepared release", async () => {
    const binding = await unlink(await fixture()); const decision = await recovery(binding);
    const other = { ...inventory.channels[1], channelId: "3333333333", environment: "PUBLISHED" as const };
    await database.lineAuthorizationLifecycle.create({ data: { bindingId: binding.id, bindingVersion: 2, tupleKey: lineChannelTupleKey(other), tupleDefinition: lineChannelTupleDefinition(other),
      applicability: "UNKNOWN", evidenceReference: "historical-inventory", requestedAt: now, remoteOutcome: "REMOTE_UNCONFIRMED", reason: "TOKEN_UNAVAILABLE" } });
    await expect(release(decision)).rejects.toThrow();
  });

  it("late old completion updates only history after explicit recovery and a newer relink", async () => {
    const binding = await unlink(await fixture());
    const attempt = await tx((transaction) => reserveLineTerminationAttempt(transaction, { ...target(binding), tupleKey: account }, inventory, now));
    if (!attempt) throw new Error("Expected attempt");
    expect(await tx((transaction) => isLineTerminationDispatchAllowed(transaction, attempt))).toBe(true);
    await tx((transaction) => recordLineTerminationOutcome(transaction, attempt, "INVALID_RESPONSE", now));
    const decision = await recovery(binding);
    await release(decision);
    expect(await tx((transaction) => isLineTerminationDispatchAllowed(transaction, attempt))).toBe(false);
    const intent = await createLineAccountIntent("LINK", deps(binding));
    const result = await linkLineAccount({ ...intent, idToken: "fresh-test-proof" }, deps(binding));
    expect(result.lifecycleVersion).toBe(3);
    await tx((transaction) => recordLineTerminationOutcome(transaction, attempt, "PROVIDER_204", now));
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).toMatchObject({ lifecycleVersion: 3, unlinkedAt: null });
    const historical = (await rows(binding)).find((row) => row.bindingVersion === 2 && row.tupleKey === account);
    if (!historical) throw new Error("Historical attempt missing");
    expect(historical.remoteOutcome).toBe("REMOTE_CONFIRMED"); expect(lineObligationStatus(historical)).toBe("RECOVERY_RELEASED_UNVERIFIED");
    expect((await rows(binding)).find((row) => row.bindingVersion === 3)?.remoteOutcome).toBe("OBSERVED");
    expect(await tx((transaction) => recordLineTerminationOutcome(transaction, attempt, "POSSIBLY_DISPATCHED", now))).toBe(false);
    await expect(tx((transaction) => reserveLineTerminationAttempt(transaction, { ...target(binding), tupleKey: account }, inventory, now))).rejects.toThrow();
  });

  it("serializes duplicate unlink so only one generation and one obligation set commits", async () => {
    const binding = await fixture(); const intent = await createLineAccountIntent("UNLINK", deps(binding));
    const results = await Promise.allSettled([unlinkLineAccount(intent, deps(binding)), unlinkLineAccount(intent, deps(binding))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).lifecycleVersion).toBe(2);
    expect(await rows(binding)).toHaveLength(2);
  });

  it("deterministically serializes observation before unlink and rejects an old observation after revocation", async () => {
    const binding = await fixture(); const intent = await createLineAccountIntent("UNLINK", deps(binding));
    const held = barrier(); const releaseLock = barrier();
    const observation = tx(async (transaction) => {
      await observeLineAuthorization(transaction, target(binding), inventory, mini, now);
      held.resolve(); await releaseLock.promise;
    });
    await held.promise;
    const disconnection = unlinkLineAccount(intent, deps(binding));
    try { await waitForLockWait(); } finally { releaseLock.resolve(); }
    await Promise.all([observation, disconnection]);
    expect((await rows(binding)).find((row) => row.bindingVersion === 2 && row.tupleKey === mini)?.applicability).toBe("OBSERVED");
    await expect(tx((transaction) => observeLineAuthorization(transaction, target(binding), inventory, mini, now))).rejects.toThrow();
  });

  it("rechecks a changed generation on Serializable retry rather than reserving stale work", async () => {
    const binding = await unlink(await fixture()); const held = barrier(); const releaseLock = barrier();
    const relinking = tx(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${binding.userId}::uuid FOR UPDATE`;
      await transaction.lineAccountBinding.update({ where: { id: binding.id }, data: { lifecycleVersion: { increment: 1 }, unlinkedAt: null, providerCleanupState: null } });
      held.resolve(); await releaseLock.promise;
    });
    await held.promise;
    let callbacks = 0;
    const reservation = tx(async (transaction) => {
      callbacks += 1;
      // Establish the old snapshot before waiting on the owner's lock.
      await transaction.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
      return reserveLineTerminationAttempt(transaction, { ...target(binding), tupleKey: account }, inventory, now);
    });
    const expectation = expect(reservation).rejects.toThrow();
    try { await waitForLockWait(); } finally { releaseLock.resolve(); }
    await relinking; await expectation;
    expect(callbacks).toBeGreaterThan(1);
    expect((await rows(binding)).every((row) => row.attemptId === null)).toBe(true);
  });

  it("recovery cannot use a mismatched session, fingerprint, challenge or missing trusted capability", async () => {
    const binding = await unlink(await fixture()); const decision = await recovery(binding);
    for (const mismatch of ["sessionHash", "fingerprint", "challengeHash"] as const) {
      const wrongAuthority: LineRecoveryAuthority = { authorize: async (request) => ({ ...await authority.authorize(request), [mismatch]: "f".repeat(64) }) };
      await expect(release(decision, inventory, wrongAuthority)).rejects.toThrow();
    }
    await expect(tx((transaction) => releaseLineRecovery(transaction, {} as Parameters<typeof releaseLineRecovery>[1], inventory, now))).rejects.toThrow();
    expect((await rows(binding)).every((row) => row.recoveryReleasedAt === null)).toBe(true);
  });

  it("crash after reservation needs bounded recovery, not a new attempt slot", async () => {
    const binding = await unlink(await fixture());
    const attempt = await tx((transaction) => reserveLineTerminationAttempt(transaction, { ...target(binding), tupleKey: account }, inventory, now));
    expect(attempt).not.toBeNull();
    await expect(tx((transaction) => prepareLineRecoverySet(transaction, target(binding), inventory, new Date(now.getTime() + 9999)))).rejects.toThrow();
    const set = await tx((transaction) => prepareLineRecoverySet(transaction, target(binding), inventory, new Date(now.getTime() + 10000)));
    expect(set.rowIds).toHaveLength(2);
    expect(await tx((transaction) => reserveLineTerminationAttempt(transaction, { ...target(binding), tupleKey: account }, inventory, new Date(now.getTime() + 10000)))).toBeNull();
  });

  it("a failing release audit rolls back all authoritative recovery writes", async () => {
    const binding = await unlink(await fixture()); const decision = await recovery(binding);
    const capability = await authorizeLineRecoveryDecision(decision, authority);
    await expect(tx(async (transaction) => {
      await releaseLineRecovery(transaction, capability, inventory, now);
      throw new Error("forced failure after audit/release/intent writes");
    })).rejects.toThrow();
    expect((await rows(binding)).every((row) => row.recoveryReleasedAt === null)).toBe(true);
    expect((await database.lineAccountActionIntent.findUniqueOrThrow({ where: { id: decision.intentId } })).consumedAt).toBeNull();
    expect(await database.auditEvent.count({ where: { actorUserId: binding.userId, action: "line.lifecycle.recovery.released" } })).toBe(0);
  });

  it("lazy recovery preparation initializes a legacy revoked binding once without assuming absent grants", async () => {
    const binding = await fixture(); const dependencies = deps(binding, false);
    const intent = await createLineAccountIntent("UNLINK", dependencies);
    await unlinkLineAccount(intent, dependencies);
    const revoked = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect((await tx((transaction) => evaluateLineRelinkEligibility(transaction, target(revoked), now))).eligible).toBe(false);
    const first = await tx((transaction) => prepareLineRecoverySet(transaction, target(revoked), inventory, now));
    const second = await tx((transaction) => prepareLineRecoverySet(transaction, target(revoked), inventory, now));
    expect(first).toEqual(second); expect(first.rowIds).toHaveLength(2);
    expect((await rows(binding)).every((row) => row.applicability === "UNKNOWN")).toBe(true);
    expect(await database.auditEvent.count({ where: { actorUserId: binding.userId, action: "line.lifecycle.initialized" } })).toBe(1);
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).lifecycleVersion).toBe(2);
  });

  it("tracks independent observed Account and MINI grants over later binding generations", async () => {
    const binding = await fixture();
    const linkIntent = await createLineAccountIntent("LINK", deps(binding));
    expect(await linkLineAccount({ ...linkIntent, idToken: "test-proof" }, deps(binding))).toMatchObject({ status: "ALREADY_LINKED", lifecycleVersion: 1 });
    await tx((transaction) => observeLineAuthorization(transaction, target(binding), inventory, mini, now));
    const revoked = await unlink(binding);
    expect((await rows(binding)).filter((row) => row.bindingVersion === 2).every((row) => row.applicability === "OBSERVED")).toBe(true);
    const decision = await recovery(revoked); await release(decision);
    const intent = await createLineAccountIntent("LINK", deps(binding));
    await linkLineAccount({ ...intent, idToken: "new-test-proof" }, deps(binding));
    const current = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    const latestRevoked = await unlink(current);
    expect(latestRevoked.lifecycleVersion).toBe(4);
    expect((await rows(binding)).filter((row) => row.bindingVersion === 2).every((row) => row.recoveryReleasedAt !== null)).toBe(true);
    expect((await rows(binding)).filter((row) => row.bindingVersion === 4).every((row) => row.recoveryReleasedAt === null)).toBe(true);
    expect((await tx((transaction) => evaluateLineRelinkEligibility(transaction, target(latestRevoked), now))).eligible).toBe(false);
  });

  it("concurrent recovery submissions consume one intent and persist one decision", async () => {
    const binding = await unlink(await fixture()); const decision = await recovery(binding);
    const capability = await authorizeLineRecoveryDecision(decision, authority);
    const results = await Promise.allSettled([0, 1].map(() => tx((transaction) => releaseLineRecovery(transaction, capability, inventory, now))));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await database.auditEvent.count({ where: { actorUserId: binding.userId, action: "line.lifecycle.recovery.released" } })).toBe(1);
  });

  it("deterministically composes actual unlink then same-owner relink while restrictions remain staged", async () => {
    const binding = await fixture();
    const unlinkIntent = await createLineAccountIntent("UNLINK", deps(binding));
    const linkIntent = await createLineAccountIntent("LINK", deps(binding));
    const held = barrier(); const releaseLock = barrier();
    const holder = tx(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${binding.userId}::uuid FOR UPDATE`;
      held.resolve(); await releaseLock.promise;
    });
    await held.promise;
    const disconnecting = unlinkLineAccount(unlinkIntent, deps(binding));
    let reconnecting: ReturnType<typeof linkLineAccount> | undefined;
    try {
      await waitForLockWait();
      reconnecting = linkLineAccount({ ...linkIntent, idToken: "fresh-test-proof" }, deps(binding));
      await waitForLockWait(2);
    } finally { releaseLock.resolve(); }
    await holder; await disconnecting;
    expect(await reconnecting).toMatchObject({ status: "LINKED", lifecycleVersion: 3 });
    const current = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(current).toMatchObject({ lifecycleVersion: 3, unlinkedAt: null });
    expect((await rows(binding)).filter((row) => row.bindingVersion === 2)).toHaveLength(2);
    // The final policy evaluator rejects pending old obligations even for an active
    // binding; activation must place this guard before ALREADY_LINKED in 17J.3D.
    expect((await tx((transaction) => evaluateLineRelinkEligibility(transaction, target(current), now))).eligible).toBe(false);
  });
});
