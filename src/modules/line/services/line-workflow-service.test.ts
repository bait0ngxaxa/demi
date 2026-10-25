import { randomBytes } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorUserRecord } from "@/modules/auth/services/actor-context-service";
import { ForbiddenError, InfrastructureError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import type { LineChannelInventory } from "../domain/line-authorization-lifecycle";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import { createLineSubjectFingerprint } from "./line-identity-fingerprint";
import type { LineMiniAppConfiguration } from "./line-mini-app-configuration";
import { parseLineWorkflowContextKeyring, sealLineWorkflowContext } from "./line-workflow-context";
import { LINE_WORKFLOW_RATE_LIMITS, lineWorkflowRateLimitInternals } from "./line-workflow-rate-limit";
import {
  evaluateLineWorkflowEligibility,
  runLineWorkflowScopedRead,
  type LineWorkflowDependencies,
  type LineWorkflowScopedReadDependencies,
  type LineWorkflowScopedSnapshot,
} from "./line-workflow-service";

const SUBJECT = `U${"a".repeat(32)}`;
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PERSON_A = "33333333-3333-4333-8333-333333333333";
const SESSION_A = "44444444-4444-4444-8444-444444444444";
const BINDING = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-10-18T03:00:00.000Z");

const configuration: LineMiniAppConfiguration = {
  environment: "DEVELOPING",
  channelId: "2000000001",
  liffId: "2000000001-MiniDev",
  origin: "https://demi.example.org",
  endpointUrl: "https://demi.example.org/line/workflow",
};

const inventory: LineChannelInventory = {
  channels: [
    { kind: "ACCOUNT", channelId: "1000000001", environment: "ACCOUNT" },
    { kind: "MINI", channelId: "2000000001", environment: "DEVELOPING" },
  ],
};

const patientActor = (changes: Partial<ActorUserRecord> = {}): ActorUserRecord => ({
  id: USER_A, personId: PERSON_A, status: "ACTIVE", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [], ...changes,
});

const keyring = parseLineWorkflowContextKeyring(JSON.stringify({
  currentKid: "k1", keys: [{ kid: "k1", encryptionKey: randomBytes(32).toString("base64url"), sessionKey: randomBytes(32).toString("base64url") }],
}));

function activeBinding(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: BINDING, userId: USER_A, lineUserId: SUBJECT, unlinkedAt: null, lifecycleVersion: 2, ...changes };
}

function setup(overrides: Partial<LineWorkflowDependencies> = {}) {
  const database = {
    lineAccountBinding: { findMany: vi.fn().mockResolvedValue([activeBinding()]), findUnique: vi.fn().mockResolvedValue(activeBinding()) },
    person: { findFirst: vi.fn().mockResolvedValue({ patientProfile: { hospitalRelationships: [{ id: "rel" }] } }) },
  };
  const verifyIdentity = vi.fn().mockResolvedValue({ subject: SUBJECT, expiresAt: new Date(NOW.getTime() + 3_600_000), verifiedAt: NOW });
  const liveSession = vi.fn().mockResolvedValue({ userId: USER_A, sessionId: SESSION_A, authSubject: "88888888-8888-4888-8888-888888888888", checkedAt: NOW });
  const actorStore = { findUserById: vi.fn().mockResolvedValue(patientActor()) };
  const rateLimiter = { consume: vi.fn().mockResolvedValue(true) };
  const dependencies: LineWorkflowDependencies = {
    database: database as unknown as PrismaClient,
    now: () => NOW,
    configuration: () => configuration,
    lifecycleInventory: vi.fn().mockResolvedValue(inventory),
    liveSession,
    verifyIdentity,
    rateLimiter,
    actorStore,
    keyring: () => keyring,
    ...overrides,
  };
  return { database, verifyIdentity, liveSession, actorStore, rateLimiter, dependencies };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(LineWorkflowFailure);
  return (error as LineWorkflowFailure).code;
}

const input = { intent: "OPEN_PATIENT_APPOINTMENTS" as const, idToken: "synthetic-mini-id-token" };

describe("MINI workflow eligibility orchestration", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1000000001");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts LINE A / DEMI A with one current ACTIVE binding and Patient SELF", async () => {
    const { dependencies, database, verifyIdentity } = setup();
    const result = await evaluateLineWorkflowEligibility(input, dependencies);
    expect(result).toMatchObject({ userId: USER_A, sessionId: SESSION_A, bindingId: BINDING, bindingVersion: 2 });
    expect(result.proofExpiresAt).toEqual(new Date(NOW.getTime() + 3_600_000));
    expect(verifyIdentity).toHaveBeenCalledWith("synthetic-mini-id-token", configuration);
    const { fingerprint, keyId } = createLineSubjectFingerprint(SUBJECT);
    expect(database.lineAccountBinding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { lineSubjectFingerprint: fingerprint, lineSubjectFingerprintKeyId: keyId, unlinkedAt: null }, take: 2,
    }));
  });

  it("checks the verified proof against time after LINE Provider I/O", async () => {
    const verifiedAt = new Date(NOW.getTime() + 25);
    const expiresAt = new Date(verifiedAt.getTime() + 3_600_000);
    const now = vi.fn().mockReturnValueOnce(NOW).mockReturnValueOnce(verifiedAt);
    const verifyIdentity = vi.fn().mockResolvedValue({ subject: SUBJECT, verifiedAt, expiresAt });
    const { dependencies, rateLimiter } = setup({ now, verifyIdentity });

    await expect(evaluateLineWorkflowEligibility(input, dependencies)).resolves.toMatchObject({
      proofVerifiedAt: verifiedAt,
      proofExpiresAt: expiresAt,
    });
    expect(rateLimiter.consume).toHaveBeenNthCalledWith(1, "VERIFY_USER", USER_A, NOW);
    expect(rateLimiter.consume).toHaveBeenNthCalledWith(2, "VERIFY_GLOBAL", "GLOBAL", NOW);
  });

  it("fails closed for LINE A / DEMI B before any Patient query and without identity disclosure", async () => {
    const { dependencies, database, actorStore } = setup({
      liveSession: vi.fn().mockResolvedValue({ userId: USER_B, sessionId: SESSION_A, checkedAt: NOW }),
    });
    const error = await evaluateLineWorkflowEligibility(input, dependencies).catch((caught: unknown) => caught);
    expect((error as LineWorkflowFailure).code).toBe("ACCOUNT_MISMATCH");
    expect(JSON.stringify({ message: (error as Error).message })).not.toMatch(new RegExp(`${USER_A}|${USER_B}|${SUBJECT}`, "u"));
    expect(database.person.findFirst).not.toHaveBeenCalled();
    expect(actorStore.findUserById).not.toHaveBeenCalled();
  });

  it("requires the current DEMI session before verifying the MINI proof", async () => {
    const { dependencies, verifyIdentity } = setup({ liveSession: vi.fn().mockRejectedValue(new UnauthenticatedError()) });
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("LOGIN_REQUIRED");
    expect(verifyIdentity).not.toHaveBeenCalled();
  });

  it.each([
    ["inactive or unmapped DEMI User", new ForbiddenError(), "WORKFLOW_INELIGIBLE"],
    ["Auth provider outage", new InfrastructureError(), "SESSION_UNAVAILABLE"],
  ])("maps %s before LINE verification", async (_label, failure, code) => {
    const { dependencies, verifyIdentity } = setup({ liveSession: vi.fn().mockRejectedValue(failure) });
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe(code);
    expect(verifyIdentity).not.toHaveBeenCalled();
  });

  it.each([
    ["an Account-only inventory", { channels: [inventory.channels[0]] }],
    ["another MINI environment", { channels: [inventory.channels[0], { ...inventory.channels[1], environment: "PUBLISHED" as const }] }],
    ["another MINI channel", { channels: [inventory.channels[0], { ...inventory.channels[1], channelId: "2000000009" }] }],
    ["two MINI channels", { channels: [inventory.channels[0], inventory.channels[1], { ...inventory.channels[1], channelId: "2000000009" }] }],
  ])("rejects when lifecycle has %s before provider work", async (_label, value) => {
    const { dependencies, verifyIdentity, liveSession } = setup({ lifecycleInventory: vi.fn().mockResolvedValue(value) });
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("LIFECYCLE_UNAVAILABLE");
    expect(liveSession).toHaveBeenCalledOnce();
    expect(verifyIdentity).not.toHaveBeenCalled();
  });

  it("rejects unavailable lifecycle readiness", async () => {
    const { dependencies } = setup({ lifecycleInventory: vi.fn().mockRejectedValue(new Error("migration missing")) });
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("LIFECYCLE_UNAVAILABLE");
  });

  it("rejects missing MINI configuration before any other work", async () => {
    const { dependencies, liveSession } = setup({ configuration: () => { throw new LineWorkflowFailure("MINI_CONFIGURATION_UNAVAILABLE"); } });
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("MINI_CONFIGURATION_UNAVAILABLE");
    expect(liveSession).not.toHaveBeenCalled();
  });

  it.each(["LINE_WRONG_AUDIENCE", "LINE_IDENTITY_INVALID", "LINE_PROVIDER_UNAVAILABLE"] as const)(
    "propagates %s without reading bindings", async (code) => {
      const { dependencies, database } = setup({ verifyIdentity: vi.fn().mockRejectedValue(new LineWorkflowFailure(code)) });
      expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe(code);
      expect(database.lineAccountBinding.findMany).not.toHaveBeenCalled();
    },
  );

  it("treats an unlinked LINE identity as not linked", async () => {
    const { dependencies, database } = setup();
    database.lineAccountBinding.findMany.mockResolvedValue([]);
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("LINE_NOT_LINKED");
  });

  it.each([
    ["ambiguous ACTIVE bindings", [activeBinding(), activeBinding({ id: "66666666-6666-4666-8666-666666666666" })]],
    ["missing raw LINE locator", [activeBinding({ lineUserId: null })]],
    ["different raw LINE locator", [activeBinding({ lineUserId: `U${"b".repeat(32)}` })]],
  ])("never chooses among %s", async (_label, rows) => {
    const { dependencies, database } = setup();
    database.lineAccountBinding.findMany.mockResolvedValue(rows);
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("BINDING_INCONSISTENT");
    expect(database.person.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["suspended User", patientActor({ status: "SUSPENDED" })],
    ["removed Patient role", patientActor({ roles: [] })],
    ["unmapped User", null],
  ])("rejects a %s", async (_label, record) => {
    const { dependencies, actorStore } = setup();
    actorStore.findUserById.mockResolvedValue(record);
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("WORKFLOW_INELIGIBLE");
  });

  it.each([
    ["missing PatientProfile", null],
    ["no own Hospital relationship", { patientProfile: { hospitalRelationships: [] } }],
  ])("rejects %s without returning an empty-success fiction", async (_label, person) => {
    const { dependencies, database } = setup();
    database.person.findFirst.mockResolvedValue(person);
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("WORKFLOW_INELIGIBLE");
  });

  it("maps database failure to a sanitized unavailable state", async () => {
    const { dependencies, database } = setup();
    database.lineAccountBinding.findMany.mockRejectedValue(new Error(`connection to ${SUBJECT} failed`));
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("INFRASTRUCTURE_UNAVAILABLE");
  });

  it("applies the shared per-user quota after the fresh exact DEMI session and before LINE Provider I/O", async () => {
    const { dependencies, verifyIdentity, liveSession, rateLimiter } = setup();
    rateLimiter.consume.mockResolvedValue(false);
    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("RATE_LIMITED");
    expect(verifyIdentity).not.toHaveBeenCalled();
    expect(liveSession).toHaveBeenCalledOnce();
    expect(rateLimiter.consume.mock.calls).toEqual([["VERIFY_USER", USER_A, NOW]]);
    expect(LINE_WORKFLOW_RATE_LIMITS.VERIFY_USER).toBe(10);
    expect(lineWorkflowRateLimitInternals.WINDOW_MS).toBe(300_000);
  });

  it("uses the global bucket only after the authenticated per-user bucket and before LINE Provider I/O", async () => {
    const { dependencies, verifyIdentity, rateLimiter } = setup();
    rateLimiter.consume.mockImplementation(async (category) => category !== "VERIFY_GLOBAL");

    expect(await codeOf(evaluateLineWorkflowEligibility(input, dependencies))).toBe("RATE_LIMITED");
    expect(rateLimiter.consume.mock.calls).toEqual([
      ["VERIFY_USER", USER_A, NOW],
      ["VERIFY_GLOBAL", "GLOBAL", NOW],
    ]);
    expect(verifyIdentity).not.toHaveBeenCalled();
  });
});

describe("mandatory scoped read boundary", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1000000001");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
  });
  afterEach(() => vi.unstubAllEnvs());

  const AUTH_SUBJECT = "88888888-8888-4888-8888-888888888888";
  const seal = (now = NOW, sessionId = SESSION_A, ring = keyring): string => sealLineWorkflowContext(
    { bindingId: BINDING, bindingVersion: 2, userId: USER_A, sessionId, proofExpiresAt: new Date(NOW.getTime() + 3_600_000) },
    { keyring: ring, tuple: configuration, now },
  ).value;
  const actorRow = (changes: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: USER_A, personId: PERSON_A, status: "ACTIVE", roles: [{ role: "PATIENT" }], memberships: [], osmHospitalRelationships: [], ...changes,
  });
  const flip = (segment: string): string => `${segment[0] === "A" ? "B" : "A"}${segment.slice(1)}`;
  const tamper = (index: number) => (value: string): string => value.split(".").map((part, at) => (at === index ? flip(part) : part)).join(".");

  function scoped(overrides: Partial<LineWorkflowScopedReadDependencies> = {}) {
    const calls: string[] = [];
    const recorded = (name: string, value: unknown) => vi.fn(async (): Promise<unknown> => {
      calls.push(name);
      return value;
    });
    const transaction = {
      lineAccountBinding: { findUnique: recorded("binding", activeBinding()) },
      user: { findFirst: recorded("mapping", { id: USER_A }), findUnique: recorded("actor", actorRow()) },
      person: { findFirst: recorded("self", { patientProfile: { hospitalRelationships: [{ id: "rel" }] } }) },
    };
    const database = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>, options: unknown): Promise<unknown> => {
        calls.push("transaction");
        expect(options).toBeDefined();
        return callback(transaction);
      }),
    };
    const liveSession = vi.fn(async () => {
      calls.push("session");
      return { userId: USER_A, sessionId: SESSION_A, authSubject: AUTH_SUBJECT };
    });
    const reader = vi.fn(async (snapshot: LineWorkflowScopedSnapshot) => {
      calls.push("read");
      return snapshot;
    });
    const dependencies: LineWorkflowScopedReadDependencies = {
      database: database as unknown as PrismaClient,
      now: () => NOW,
      configuration: () => configuration,
      lifecycleInventory: vi.fn().mockResolvedValue(inventory),
      liveSession,
      keyring: () => keyring,
      ...overrides,
    };
    return { calls, transaction, database, liveSession, reader, dependencies };
  }

  it("validates everything in one RepeatableRead snapshot before the reader uses that same client", async () => {
    const { calls, transaction, database, reader, dependencies } = scoped();
    const snapshot = await runLineWorkflowScopedRead(seal(), reader, dependencies);
    expect(snapshot.database).toBe(transaction);
    expect(snapshot.actor).toMatchObject({ userId: USER_A, personId: PERSON_A, roles: ["PATIENT"] });
    // Provider liveness strictly before the transaction; the domain read strictly last.
    expect(calls).toEqual(["session", "transaction", "binding", "mapping", "actor", "self", "read"]);
    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(database.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead", maxWait: 2000, timeout: 5000 });
    expect(transaction.user.findFirst).toHaveBeenCalledWith({ where: { id: USER_A, authSubject: AUTH_SUBJECT }, select: { id: true } });
  });

  it("fails safely without MINI provider configuration before reading the context", async () => {
    const { liveSession, reader, dependencies } = scoped({ configuration: undefined });
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("MINI_CONFIGURATION_UNAVAILABLE");
    expect(liveSession).not.toHaveBeenCalled();
  });

  it("denies a missing context instead of downgrading to ordinary DEMI authority", async () => {
    const { liveSession, database, reader, dependencies } = scoped();
    for (const credential of [undefined, ""]) {
      expect(await codeOf(runLineWorkflowScopedRead(credential, reader, dependencies))).toBe("SCOPE_MISSING");
    }
    expect(liveSession).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["tampered nonce", tamper(2)],
    ["tampered ciphertext", tamper(3)],
    ["tampered tag", tamper(4)],
    ["malformed envelope", (): string => "not-a-context"],
  ])("rejects a %s before session or database work", async (_label, mutate) => {
    const { liveSession, database, reader, dependencies } = scoped();
    expect(await codeOf(runLineWorkflowScopedRead(mutate(seal()), reader, dependencies))).toBe("SCOPE_INVALID");
    expect(liveSession).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a context from another environment or an unknown/retired key", async () => {
    const other = parseLineWorkflowContextKeyring(JSON.stringify({
      currentKid: "k2", keys: [{ kid: "k2", encryptionKey: randomBytes(32).toString("base64url"), sessionKey: randomBytes(32).toString("base64url") }],
    }));
    const { reader, dependencies } = scoped();
    expect(await codeOf(runLineWorkflowScopedRead(seal(NOW, SESSION_A, other), reader, dependencies))).toBe("SCOPE_INVALID");
    const published = { ...configuration, environment: "PUBLISHED" as const };
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, { ...dependencies, configuration: () => published }))).toBe("SCOPE_INVALID");
  });

  it("rejects an expired context, and reading never extends it", async () => {
    const expired = scoped({ now: () => new Date(NOW.getTime() + 900_000) });
    expect(await codeOf(runLineWorkflowScopedRead(seal(), expired.reader, expired.dependencies))).toBe("SCOPE_EXPIRED");
    expect(expired.liveSession).not.toHaveBeenCalled();
    const lastSecond = scoped({ now: () => new Date(NOW.getTime() + 899_000) });
    await expect(runLineWorkflowScopedRead(seal(), lastSecond.reader, lastSecond.dependencies)).resolves.toBeDefined();
  });

  it("rechecks absolute expiry inside the transaction after any wait", async () => {
    let tick = 0;
    const { reader, dependencies } = scoped({ now: () => new Date(NOW.getTime() + (tick++ === 0 ? 899_000 : 900_000)) });
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("SCOPE_EXPIRED");
    expect(reader).not.toHaveBeenCalled();
  });

  it.each([
    ["another DEMI session of the same User", { userId: USER_A, sessionId: "77777777-7777-4777-8777-777777777777", authSubject: AUTH_SUBJECT }],
    ["another DEMI User", { userId: USER_B, sessionId: SESSION_A, authSubject: AUTH_SUBJECT }],
  ])("rejects %s before the transaction", async (_label, session) => {
    const { database, reader, dependencies } = scoped({ liveSession: vi.fn().mockResolvedValue(session) });
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("SCOPE_SESSION_MISMATCH");
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthenticated", new UnauthenticatedError(), "LOGIN_REQUIRED"],
    ["inactive", new ForbiddenError(), "WORKFLOW_INELIGIBLE"],
    ["provider outage", new InfrastructureError(), "SESSION_UNAVAILABLE"],
  ])("maps a %s exact session to its state without opening a transaction", async (_label, failure, code) => {
    const { database, reader, dependencies } = scoped({ liveSession: vi.fn().mockRejectedValue(failure) });
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe(code);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["changed binding generation", activeBinding({ lifecycleVersion: 3 })],
    ["unlinked binding", activeBinding({ unlinkedAt: NOW })],
    ["binding moved to another User", activeBinding({ userId: USER_B })],
    ["cleanup-only binding", activeBinding({ lineUserId: null })],
    ["missing binding", null],
  ])("rejects a %s as revoked inside the snapshot without a domain read", async (_label, row) => {
    const { transaction, reader, dependencies } = scoped();
    transaction.lineAccountBinding.findUnique.mockResolvedValue(row);
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("SCOPE_REVOKED");
    expect(reader).not.toHaveBeenCalled();
  });

  it("rejects a session whose Auth subject no longer maps to the context User", async () => {
    const { transaction, reader, dependencies } = scoped();
    transaction.user.findFirst.mockResolvedValue(null);
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("SCOPE_SESSION_MISMATCH");
    expect(reader).not.toHaveBeenCalled();
  });

  it.each([
    ["suspended User", actorRow({ status: "SUSPENDED" })],
    ["removed Patient role", actorRow({ roles: [{ role: "OSM" }] })],
    ["unmapped or quarantined User", null],
  ])("rejects a %s from the transaction-backed actor store", async (_label, row) => {
    const { transaction, reader, dependencies } = scoped();
    transaction.user.findUnique.mockResolvedValue(row);
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("WORKFLOW_INELIGIBLE");
    expect(reader).not.toHaveBeenCalled();
  });

  it("rejects removed persisted Patient SELF eligibility", async () => {
    const { transaction, reader, dependencies } = scoped();
    transaction.person.findFirst.mockResolvedValue({ patientProfile: { hospitalRelationships: [] } });
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("WORKFLOW_INELIGIBLE");
    expect(reader).not.toHaveBeenCalled();
  });

  it("fails closed on a MINI channel missing from the lifecycle inventory before the Auth provider check", async () => {
    const accountOnly = { channels: [inventory.channels[0]] };
    const { liveSession, reader, dependencies } = scoped({ lifecycleInventory: vi.fn().mockResolvedValue(accountOnly) });
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("LIFECYCLE_UNAVAILABLE");
    expect(liveSession).not.toHaveBeenCalled();
  });

  it("maps transaction timeout or conflict to unavailable, never to data", async () => {
    const { database, reader, dependencies } = scoped();
    database.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Transaction already closed", { code: "P2028", clientVersion: "6" }));
    expect(await codeOf(runLineWorkflowScopedRead(seal(), reader, dependencies))).toBe("INFRASTRUCTURE_UNAVAILABLE");
  });

  it("passes domain resource denials through for safe classification", async () => {
    const { dependencies } = scoped();
    await expect(runLineWorkflowScopedRead(seal(), async () => { throw new NotFoundError(); }, dependencies)).rejects.toBeInstanceOf(NotFoundError);
  });
});
