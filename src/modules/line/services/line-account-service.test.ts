import {
  LineAccountAction,
  LineAccountActionOutcome,
  LineMenuSyncState,
  LineProviderCleanupState,
  LineReachability,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/shared/errors/application-error";

import { LineFailure } from "../domain/line-errors";
import { createLineSubjectFingerprint } from "./line-identity-fingerprint";
import {
  createLineAccountIntent,
  getLineAccountSummary,
  lineAccountInternals,
  linkLineAccount,
  unlinkLineAccount,
} from "./line-account-service";
import type { CurrentLineSession } from "./line-session-service";

const userId = "83da3ab8-2895-4cab-bb63-19f807246288";
const bindingId = "1a9c6559-3f23-44b6-b920-07d176777772";
const intentId = "82ce5f58-4a66-4b03-a5e8-2418e8544271";
const lineSubject = `U${"a".repeat(32)}`;
const challenge = "secure-256-bit-challenge-for-tests-000000000000000000000";
const session: CurrentLineSession = { userId, sessionHash: "a".repeat(64) };
const now = new Date("2026-10-06T00:00:00.000Z");

function activeIntent(action: LineAccountAction = LineAccountAction.LINK) {
  return {
    id: intentId,
    userId,
    action,
    challengeHash: lineAccountInternals.sha256(challenge),
    sessionHash: session.sessionHash,
    createdAt: new Date(now.getTime() - 1000),
    expiresAt: new Date(now.getTime() + 60_000),
    consumedAt: null,
    outcome: null,
  };
}

type ActionIntentFixture = Omit<ReturnType<typeof activeIntent>, "consumedAt"> & { consumedAt: Date | null };

function createLinkHarness(options: {
  intent?: ActionIntentFixture | null;
  userStatus?: UserStatus;
  binding?: Record<string, unknown> | null;
  history?: readonly Record<string, unknown>[];
} = {}) {
  const intent = options.intent === undefined ? activeIntent() : options.intent;
  const binding = options.binding ?? null;
  const history = options.history ?? [];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: { findUnique: vi.fn().mockResolvedValue({ status: options.userStatus ?? UserStatus.ACTIVE }) },
    lineAccountActionIntent: {
      findUnique: vi.fn().mockImplementation(async () => intent),
      update: vi.fn().mockResolvedValue({}),
    },
    lineAccountBinding: {
      findFirst: vi.fn().mockResolvedValue(binding),
      findMany: vi.fn().mockResolvedValue(history),
      create: vi.fn().mockResolvedValue({ id: bindingId, lifecycleVersion: 1 }),
      update: vi.fn().mockResolvedValue({ id: bindingId, lifecycleVersion: 2 }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const database = {
    user: { findUnique: vi.fn().mockResolvedValue({ status: options.userStatus ?? UserStatus.ACTIVE }) },
    lineAccountActionIntent: { findUnique: vi.fn().mockResolvedValue(intent) },
    lineAccountBinding: { findFirst: vi.fn().mockResolvedValue({ id: bindingId }) },
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  return { database, tx, intent };
}

function dependencies(database: ReturnType<typeof createLinkHarness>["database"]) {
  return {
    database: database as unknown as PrismaClient,
    now: () => now,
    currentSession: async () => session,
    verifyIdentity: vi.fn(async () => ({ subject: lineSubject })),
  };
}

describe("LINE account lifecycle service", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates a cryptographically random 256-bit challenge with a five-minute bound intent", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: UserStatus.ACTIVE }) },
      lineAccountBinding: { findFirst: vi.fn() },
      lineAccountActionIntent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation(({ data }) => ({ id: intentId, expiresAt: data.expiresAt })),
      },
    };
    const database = { $transaction: vi.fn(async (operation) => operation(tx)) };
    const created = await createLineAccountIntent(LineAccountAction.LINK, {
      database: database as unknown as PrismaClient,
      currentSession: async () => session,
      now: () => now,
    });
    expect(Buffer.from(created.challenge, "base64url")).toHaveLength(32);
    expect(tx.lineAccountActionIntent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        challengeHash: lineAccountInternals.sha256(created.challenge),
        sessionHash: session.sessionHash,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      }),
    }));
    expect(created.challenge).not.toBe(lineAccountInternals.sha256(created.challenge));
  });

  it("verifies LINE before entering the transaction, then creates the binding and minimizes audit metadata", async () => {
    const harness = createLinkHarness();
    const deps = dependencies(harness.database);
    const verifyIdentity = vi.fn(async () => ({ subject: lineSubject }));
    deps.verifyIdentity = verifyIdentity;
    const result = await linkLineAccount({ intentId, challenge, idToken: "raw-id-token" }, deps);
    expect(verifyIdentity).toHaveBeenCalledOnce();
    expect(harness.database.$transaction).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "LINKED", bindingId, lifecycleVersion: 1 });
    expect(harness.tx.$queryRaw.mock.invocationCallOrder[0]).toBeGreaterThan(verifyIdentity.mock.invocationCallOrder[0]);
    expect(harness.tx.lineAccountBinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        lineUserId: lineSubject,
        lineSubjectFingerprint: createLineSubjectFingerprint(lineSubject).fingerprint,
        lineSubjectFingerprintKeyId: createLineSubjectFingerprint(lineSubject).keyId,
        reachability: LineReachability.UNKNOWN,
        providerCleanupState: null,
      }),
    });
    expect(harness.tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "line.account.linked",
        resourceType: "LineAccountBinding",
        resourceId: bindingId,
      }),
    });
    expect(JSON.stringify(harness.tx.auditEvent.create.mock.calls)).not.toContain(lineSubject);
  });

  it("does not call LINE when the intent is stale, replayed, or bound to another session", async () => {
    const expiredHarness = createLinkHarness({ intent: { ...activeIntent(), expiresAt: now } });
    const expired = dependencies(expiredHarness.database);
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, expired)).rejects.toMatchObject({ code: "LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED" });
    expect(expired.verifyIdentity).not.toHaveBeenCalled();

    const replayedHarness = createLinkHarness({ intent: { ...activeIntent(), consumedAt: now } });
    const replayed = dependencies(replayedHarness.database);
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, replayed)).rejects.toBeInstanceOf(LineFailure);
    expect(replayed.verifyIdentity).not.toHaveBeenCalled();

    const changedSessionHarness = createLinkHarness();
    const changedSession = dependencies(changedSessionHarness.database);
    changedSession.currentSession = async () => ({ ...session, sessionHash: "b".repeat(64) });
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, changedSession)).rejects.toBeInstanceOf(LineFailure);
    expect(changedSession.verifyIdentity).not.toHaveBeenCalled();
  });

  it("rejects invalid LINE verification and an account that became inactive before commit", async () => {
    const invalidHarness = createLinkHarness();
    const invalid = dependencies(invalidHarness.database);
    invalid.verifyIdentity = vi.fn(async () => { throw new LineFailure("LINE_TOKEN_INVALID_OR_EXPIRED"); });
    await expect(linkLineAccount({ intentId, challenge, idToken: "expired" }, invalid)).rejects.toMatchObject({ code: "LINE_TOKEN_INVALID_OR_EXPIRED" });
    expect(invalidHarness.database.$transaction).not.toHaveBeenCalled();

    const inactiveHarness = createLinkHarness();
    inactiveHarness.database.user.findUnique.mockResolvedValueOnce({ status: UserStatus.ACTIVE });
    inactiveHarness.tx.user.findUnique.mockResolvedValueOnce({ status: UserStatus.SUSPENDED });
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, dependencies(inactiveHarness.database))).rejects.toMatchObject({ code: "DEMI_ACCOUNT_INELIGIBLE" });
    expect(inactiveHarness.tx.lineAccountBinding.create).not.toHaveBeenCalled();
  });

  it("returns an idempotent same-user binding without incrementing its lifecycle", async () => {
    const identity = createLineSubjectFingerprint(lineSubject);
    const existing = {
      id: bindingId,
      userId,
      lineSubjectFingerprint: identity.fingerprint,
      lineSubjectFingerprintKeyId: identity.keyId,
      lifecycleVersion: 4,
    };
    const harness = createLinkHarness({ binding: existing, history: [existing] });
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, dependencies(harness.database))).resolves.toEqual({
      status: "ALREADY_LINKED",
      bindingId,
      lifecycleVersion: 4,
    });
    expect(harness.tx.lineAccountBinding.update).not.toHaveBeenCalled();
    expect(harness.tx.lineAccountBinding.create).not.toHaveBeenCalled();
  });

  it("rejects a different active LINE subject on this User and an active subject on another User", async () => {
    const current = createLineSubjectFingerprint(lineSubject);
    const other = createLineSubjectFingerprint(`U${"b".repeat(32)}`);
    const ownBinding = { id: bindingId, userId, lineSubjectFingerprint: other.fingerprint, lineSubjectFingerprintKeyId: other.keyId };
    const ownHarness = createLinkHarness({ binding: ownBinding, history: [ownBinding] });
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, dependencies(ownHarness.database)))
      .rejects.toMatchObject({ code: "LINE_BINDING_CONFLICT" });
    expect(ownHarness.tx.lineAccountBinding.create).not.toHaveBeenCalled();

    const otherOwner = { ...ownBinding, userId: "ca8b9f8d-9084-4b86-9860-c8c95e246d76", lineSubjectFingerprint: current.fingerprint, lineSubjectFingerprintKeyId: current.keyId };
    const otherHarness = createLinkHarness({ history: [otherOwner] });
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, dependencies(otherHarness.database)))
      .rejects.toMatchObject({ code: "LINE_BINDING_CONFLICT" });
    expect(otherHarness.tx.lineAccountBinding.create).not.toHaveBeenCalled();
  });

  it("reactivates only the same user's retained fingerprint and resets presentation state", async () => {
    const identity = createLineSubjectFingerprint(lineSubject);
    const history = {
      id: bindingId,
      userId,
      lineSubjectFingerprint: identity.fingerprint,
      lineSubjectFingerprintKeyId: identity.keyId,
      unlinkedAt: now,
    };
    const harness = createLinkHarness({ history: [history] });
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, dependencies(harness.database))).resolves.toEqual({
      status: "LINKED",
      bindingId,
      lifecycleVersion: 2,
    });
    expect(harness.tx.lineAccountBinding.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: bindingId },
      data: expect.objectContaining({
        lineUserId: lineSubject,
        unlinkedAt: null,
        lifecycleVersion: { increment: 1 },
        presentationRole: null,
        reachability: LineReachability.UNKNOWN,
        providerCleanupState: null,
        providerCleanupAttemptCount: 0,
      }),
    }));
  });

  it("consumes a conflicting cross-user history intent and never transfers the binding", async () => {
    const identity = createLineSubjectFingerprint(lineSubject);
    const historical = {
      id: bindingId,
      userId: "ca8b9f8d-9084-4b86-9860-c8c95e246d76",
      lineSubjectFingerprint: identity.fingerprint,
      lineSubjectFingerprintKeyId: identity.keyId,
      unlinkedAt: now,
      reconcileLeaseExpiresAt: null,
    };
    const harness = createLinkHarness({ history: [historical] });
    await expect(linkLineAccount({ intentId, challenge, idToken: "token" }, dependencies(harness.database))).rejects.toMatchObject({ code: "LINE_BINDING_CONFLICT" });
    expect(harness.tx.lineAccountBinding.create).not.toHaveBeenCalled();
    expect(harness.tx.lineAccountActionIntent.update).toHaveBeenCalledWith({
      where: { id: intentId },
      data: { consumedAt: now, outcome: LineAccountActionOutcome.CONFLICT },
    });
  });

  it("authoritatively unlinks locally and leaves provider cleanup for post-commit", async () => {
    const intent = activeIntent(LineAccountAction.UNLINK);
    const activeBinding = { id: bindingId, lineUserId: lineSubject, lifecycleVersion: 8 };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: UserStatus.ACTIVE }) },
      lineAccountActionIntent: { findUnique: vi.fn().mockResolvedValue(intent), update: vi.fn().mockResolvedValue({}) },
      lineAccountBinding: {
        findFirst: vi.fn().mockResolvedValue(activeBinding),
        update: vi.fn().mockResolvedValue({ id: bindingId, lifecycleVersion: 9 }),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      user: { findUnique: vi.fn().mockResolvedValue({ status: UserStatus.ACTIVE }) },
      lineAccountActionIntent: { findUnique: vi.fn().mockResolvedValue(intent) },
      $transaction: vi.fn(async (operation) => operation(tx)),
    };
    const result = await unlinkLineAccount({ intentId, challenge }, {
      database: database as unknown as PrismaClient,
      currentSession: async () => session,
      now: () => now,
    });
    expect(result).toEqual({ status: "UNLINKED", bindingId, lifecycleVersion: 9 });
    expect(tx.lineAccountBinding.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: bindingId },
      data: expect.objectContaining({
        unlinkedAt: now,
        lifecycleVersion: { increment: 1 },
        presentationRole: null,
        providerCleanupState: LineProviderCleanupState.PENDING,
        menuExpectedKey: "UNLINKED",
      }),
    }));
    expect(JSON.stringify(tx.lineAccountBinding.update.mock.calls)).not.toContain(lineSubject);
  });

  it("does not issue self-service intents for non-ACTIVE DEMI users", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: UserStatus.SUSPENDED }) },
    };
    const database = { $transaction: vi.fn(async (operation) => operation(tx)) };
    await expect(createLineAccountIntent(LineAccountAction.LINK, {
      database: database as unknown as PrismaClient,
      currentSession: async () => session,
      now: () => now,
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("bounds how often an authenticated user can create short-lived action intents", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: UserStatus.ACTIVE }) },
      lineAccountBinding: { findFirst: vi.fn() },
      lineAccountActionIntent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(5),
        create: vi.fn(),
      },
    };
    const database = { $transaction: vi.fn(async (operation) => operation(tx)) };
    await expect(createLineAccountIntent(LineAccountAction.LINK, {
      database: database as unknown as PrismaClient,
      currentSession: async () => session,
      now: () => now,
    })).rejects.toMatchObject({ code: "LINE_RATE_LIMITED" });
    expect(tx.lineAccountActionIntent.create).not.toHaveBeenCalled();
  });

  it("keeps unlink available for an ACTIVE account with no operational workspace", async () => {
    const database = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: userId,
          personId: "d1a0b194-e404-4688-a7d4-42c693e2a112",
          status: UserStatus.ACTIVE,
          roles: [],
          memberships: [],
          osmHospitalRelationships: [],
        }),
      },
      lineAccountBinding: {
        findFirst: vi.fn().mockResolvedValue({
          reachability: LineReachability.UNKNOWN,
          menuSyncState: LineMenuSyncState.UNKNOWN,
          providerCleanupState: null,
        }),
      },
    };
    await expect(getLineAccountSummary({ database: database as unknown as PrismaClient, currentSession: async () => session }))
      .resolves.toMatchObject({ status: "INELIGIBLE", canUnlink: true });
  });
});
