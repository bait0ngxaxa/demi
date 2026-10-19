import { randomBytes } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLineSubjectFingerprint } from "./line-identity-fingerprint";
import type { LineMiniAppConfiguration } from "./line-mini-app-configuration";
import { openLineWorkflowContext, parseLineWorkflowContextKeyring } from "./line-workflow-context";
import {
  issueLineWorkflowContext,
  type LineWorkflowDependencies,
  type LineWorkflowEligibility,
} from "./line-workflow-service";
import { lineChannelTupleKey, type LineChannelInventory } from "../domain/line-authorization-lifecycle";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_SUBJECT = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const BINDING_ID = "55555555-5555-4555-8555-555555555555";
const LINE_SUBJECT = `U${"a".repeat(32)}`;
const NOW = new Date("2026-10-18T03:00:00.000Z");
const configuration: LineMiniAppConfiguration = {
  environment: "DEVELOPING", channelId: "2000000001", liffId: "2000000001-MiniDev",
  origin: "https://demi.example.org", endpointUrl: "https://demi.example.org/line/workflow",
};
const inventory: LineChannelInventory = { channels: [
  { kind: "ACCOUNT", channelId: "1000000001", environment: "ACCOUNT" },
  { kind: "MINI", channelId: "2000000001", environment: "DEVELOPING" },
] };
const keyring = parseLineWorkflowContextKeyring(JSON.stringify({
  currentKid: "synthetic-1", keys: [{ kid: "synthetic-1", encryptionKey: randomBytes(32).toString("base64url"), sessionKey: randomBytes(32).toString("base64url") }],
}));
function currentFingerprint() {
  return createLineSubjectFingerprint(LINE_SUBJECT);
}
const eligibility: LineWorkflowEligibility = {
  intent: "OPEN_PATIENT_APPOINTMENTS",
  userId: USER_ID,
  sessionId: SESSION_ID,
  authSubject: AUTH_SUBJECT,
  verifiedLineSubject: LINE_SUBJECT,
  bindingId: BINDING_ID,
  bindingVersion: 2,
  proofVerifiedAt: NOW,
  proofExpiresAt: new Date(NOW.getTime() + 60 * 60_000),
  miniTupleKey: lineChannelTupleKey(inventory.channels[1]),
};

function binding(changes: Record<string, unknown> = {}): Record<string, unknown> {
  const subjectFingerprint = currentFingerprint();
  return {
    id: BINDING_ID, userId: USER_ID, lineUserId: LINE_SUBJECT,
    lineSubjectFingerprint: subjectFingerprint.fingerprint,
    lineSubjectFingerprintKeyId: subjectFingerprint.keyId,
    unlinkedAt: null, lifecycleVersion: 2, ...changes,
  };
}

function setup(overrides: {
  binding?: Record<string, unknown> | null;
  mapped?: unknown;
  actor?: unknown;
  patient?: unknown;
  lifecycleInventory?: LineChannelInventory;
  liveSession?: () => Promise<{ userId: string; sessionId: string; authSubject: string }>;
  now?: () => Date;
} = {}) {
  const calls: string[] = [];
  const observed = vi.fn().mockResolvedValue(undefined);
  const transaction = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      calls.push(sql.includes("LineAuthorizationLifecycle") ? "lock:lifecycle" : sql.includes("LineAccountBinding") ? "lock:binding" : "lock:user");
      return [];
    }),
    lineAccountBinding: { findUnique: vi.fn().mockResolvedValue(overrides.binding === undefined ? binding() : overrides.binding) },
    lineAuthorizationLifecycle: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: observed,
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(overrides.mapped === undefined ? { id: USER_ID } : overrides.mapped),
      findUnique: vi.fn().mockResolvedValue(overrides.actor === undefined ? {
        id: USER_ID, personId: PERSON_ID, status: "ACTIVE", roles: [{ role: "PATIENT" }], memberships: [], osmHospitalRelationships: [],
      } : overrides.actor),
    },
    person: { findFirst: vi.fn().mockResolvedValue(overrides.patient === undefined ? {
      patientProfile: { hospitalRelationships: [{ id: "66666666-6666-4666-8666-666666666666" }] },
    } : overrides.patient) },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: "77777777-7777-4777-8777-777777777777" }) },
  };
  const database = {
    $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>, options: unknown) => {
      calls.push("transaction");
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5_000 });
      return operation(transaction);
    }),
  };
  const dependencies: LineWorkflowDependencies = {
    database: database as unknown as PrismaClient,
    now: overrides.now ?? (() => NOW),
    configuration: () => configuration,
    lifecycleInventory: vi.fn().mockResolvedValue(overrides.lifecycleInventory ?? inventory),
    liveSession: overrides.liveSession ?? vi.fn().mockResolvedValue({ userId: USER_ID, sessionId: SESSION_ID, authSubject: AUTH_SUBJECT }),
    keyring: () => keyring,
  };
  return { calls, observed, transaction, database, dependencies };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(LineWorkflowFailure);
  return (error as LineWorkflowFailure).code;
}

describe("serialized MINI context issuance", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1000000001");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("locks User, binding and lifecycle rows, records the reviewed MINI observation and seals after commit", async () => {
    const { calls, observed, transaction, database, dependencies } = setup();
    const result = await issueLineWorkflowContext(eligibility, dependencies);
    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(observed).toHaveBeenCalledWith(expect.objectContaining({
      where: { bindingId_bindingVersion_tupleKey: {
        bindingId: BINDING_ID, bindingVersion: 2, tupleKey: eligibility.miniTupleKey,
      } },
      create: expect.objectContaining({
        bindingId: BINDING_ID, bindingVersion: 2, applicability: "OBSERVED",
        evidenceReference: "LINE_CHANNEL_V2", observedAt: NOW,
      }),
    }));
    expect(transaction.auditEvent.create).toHaveBeenCalledOnce();
    expect(calls.indexOf("lock:user")).toBeLessThan(calls.indexOf("lock:binding"));
    expect(calls.indexOf("lock:binding")).toBeLessThan(calls.indexOf("lock:lifecycle"));
    const opened = openLineWorkflowContext(result.value, { keyring, tuple: configuration, now: NOW });
    expect(opened).toMatchObject({
      intent: "OPEN_PATIENT_APPOINTMENTS", userId: USER_ID, bindingId: BINDING_ID,
      bindingVersion: 2, proofExpiresAt: Math.floor(eligibility.proofExpiresAt.getTime() / 1000),
    });
    expect(result.value).not.toContain(LINE_SUBJECT);
    expect(result.value).not.toContain(SESSION_ID);
  });

  it.each([
    ["unlink committed first", { binding: binding({ unlinkedAt: NOW, lifecycleVersion: 3 }) }],
    ["relink advanced the generation", { binding: binding({ lifecycleVersion: 3 }) }],
    ["the LINE locator changed", { binding: binding({ lineUserId: `U${"b".repeat(32)}` }) }],
    ["Patient SELF eligibility was removed", { patient: { patientProfile: { hospitalRelationships: [] } } }],
    ["the canonical Patient actor was removed", { actor: { id: USER_ID, personId: PERSON_ID, status: "ACTIVE", roles: [], memberships: [], osmHospitalRelationships: [] } }],
  ] as const)("denies when %s and commits no MINI observation", async (_label, overrides) => {
    const { observed, dependencies } = setup(overrides);
    expect(await codeOf(issueLineWorkflowContext(eligibility, dependencies))).toBe("WORKFLOW_INELIGIBLE");
    expect(observed).not.toHaveBeenCalled();
  });

  it("denies a changed verified Auth subject mapping without exposing a binding result", async () => {
    const { observed, dependencies } = setup({ mapped: null });
    expect(await codeOf(issueLineWorkflowContext(eligibility, dependencies))).toBe("SCOPE_SESSION_MISMATCH");
    expect(observed).not.toHaveBeenCalled();
  });

  it("rechecks the exact DEMI session before opening the transaction", async () => {
    const { database, observed, dependencies } = setup({
      liveSession: vi.fn().mockResolvedValue({ userId: USER_ID, sessionId: "88888888-8888-4888-8888-888888888888", authSubject: AUTH_SUBJECT }),
    });
    expect(await codeOf(issueLineWorkflowContext(eligibility, dependencies))).toBe("SCOPE_SESSION_MISMATCH");
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(observed).not.toHaveBeenCalled();
  });

  it("rechecks proof expiry after transaction entry and records no observation", async () => {
    const { observed, dependencies } = setup({ now: () => new Date(NOW.getTime() + 60 * 60_000) });
    expect(await codeOf(issueLineWorkflowContext(eligibility, dependencies))).toBe("LINE_IDENTITY_INVALID");
    expect(observed).not.toHaveBeenCalled();
  });

  it("retries only through the bounded Serializable helper and rereads the current generation", async () => {
    const { database, observed, transaction, dependencies } = setup();
    const serialization = new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "6.19.3" });
    let attempt = 0;
    const retryCalls: number[] = [];
    database.$transaction.mockImplementation(async (operation, options) => {
      attempt += 1;
      retryCalls.push(attempt);
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5_000 });
      if (attempt === 1) {
        await operation(transaction);
        throw serialization;
      }
      const fresh = setup({ binding: binding({ unlinkedAt: NOW, lifecycleVersion: 3 }) }).transaction;
      return operation(fresh as never);
    });
    expect(await codeOf(issueLineWorkflowContext(eligibility, dependencies))).toBe("WORKFLOW_INELIGIBLE");
    expect(retryCalls).toEqual([1, 2]);
    expect(observed).toHaveBeenCalledOnce();
  });
});
