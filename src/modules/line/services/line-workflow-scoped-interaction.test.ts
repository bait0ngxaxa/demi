import { randomBytes } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppointmentInteractionPrecondition } from "@/modules/appointments/services/appointment-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, InfrastructureError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({ acknowledge: vi.fn(), cancellation: vi.fn() }));

vi.mock("@/modules/appointments/services/appointment-service", () => ({
  acknowledgeOwnPatientAppointment: mocks.acknowledge,
  requestOwnPatientAppointmentCancellation: mocks.cancellation,
}));

import type { LineChannelInventory } from "../domain/line-authorization-lifecycle";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import type { LineMiniAppConfiguration } from "./line-mini-app-configuration";
import { parseLineWorkflowContextKeyring, sealLineWorkflowContext } from "./line-workflow-context";
import { runLineWorkflowScopedInteraction, type LineWorkflowScopedMutationDependencies } from "./line-workflow-service";

const USER_A = "11111111-1111-4111-8111-111111111111";
const PERSON_A = "33333333-3333-4333-8333-333333333333";
const SESSION_A = "44444444-4444-4444-8444-444444444444";
const BINDING = "55555555-5555-4555-8555-555555555555";
const AUTH_SUBJECT = "88888888-8888-4888-8888-888888888888";
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
  currentKid: "k1", keys: [{ kid: "k1", encryptionKey: randomBytes(32).toString("base64url"), sessionKey: randomBytes(32).toString("base64url") }],
}));
const input = { patientHospitalRelationshipId: "66666666-6666-4666-8666-666666666666", appointmentId: "77777777-7777-4777-8777-777777777777",
  expectedUpdatedAt: "2026-10-01T00:00:00.000Z" };
const seal = (issuedAt = NOW): string => sealLineWorkflowContext(
  { bindingId: BINDING, bindingVersion: 2, userId: USER_A, sessionId: SESSION_A, proofExpiresAt: new Date(NOW.getTime() + 3_600_000) },
  { keyring, tuple: configuration, now: issuedAt },
).value;
const actorRow = { id: USER_A, personId: PERSON_A, status: "ACTIVE", roles: [{ role: "PATIENT" }], memberships: [], osmHospitalRelationships: [] };
const binding = (changes: Record<string, unknown> = {}) => ({ userId: USER_A, lineUserId: "Uabc", unlinkedAt: null, lifecycleVersion: 2, ...changes });

function setup(overrides: { binding?: Record<string, unknown> | null; mapped?: unknown; lock?: () => Promise<unknown> } = {}) {
  const calls: string[] = [];
  const recorded = (name: string, value: unknown) => vi.fn(async () => {
    calls.push(name);
    return value;
  });
  const lockValues: unknown[][] = [];
  const lockSql: string[] = [];
  const transaction = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      calls.push(sql.includes("\"LineAccountBinding\"") ? "lock:binding" : "lock:user");
      lockSql.push(sql);
      lockValues.push(values);
      return overrides.lock ? overrides.lock() : [];
    }),
    lineAccountBinding: { findUnique: recorded("binding", overrides.binding === undefined ? binding() : overrides.binding) },
    user: { findFirst: recorded("mapping", overrides.mapped === undefined ? { id: USER_A } : overrides.mapped), findUnique: recorded("actor", actorRow) },
    person: { findFirst: recorded("self", { patientProfile: { hospitalRelationships: [{ id: "rel" }] } }) },
  };
  // Outside-transaction reads (early eligibility) use the injected client, never a global one.
  const database = {
    user: { findUnique: recorded("outside:actor", actorRow) },
    person: { findFirst: recorded("outside:self", { patientProfile: { hospitalRelationships: [{ id: "rel" }] } }) },
  };
  const liveSession = vi.fn(async () => {
    calls.push("session");
    return { userId: USER_A, sessionId: SESSION_A, authSubject: AUTH_SUBJECT };
  });
  const rateLimiter = { consume: vi.fn().mockResolvedValue(true) };
  const emulate = (result: unknown) => async (actor: ActorContext, _input: unknown, dependencies: { beforeInteractionInTransaction: AppointmentInteractionPrecondition }) => {
    calls.push("service");
    try {
      await dependencies.beforeInteractionInTransaction(transaction as unknown as Prisma.TransactionClient, actor);
    } catch {
      // The real Appointment service normalizes foreign errors like this.
      throw new InfrastructureError();
    }
    calls.push("domain");
    return result;
  };
  mocks.acknowledge.mockImplementation(emulate({ kind: "ack" }));
  mocks.cancellation.mockImplementation(emulate({ kind: "cancel" }));
  const dependencies: LineWorkflowScopedMutationDependencies = {
    database: database as unknown as PrismaClient,
    now: () => NOW,
    configuration: () => configuration,
    lifecycleInventory: vi.fn().mockResolvedValue(inventory),
    liveSession,
    keyring: () => keyring,
    rateLimiter,
  };
  return { calls, lockSql, lockValues, transaction, liveSession, rateLimiter, dependencies };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(LineWorkflowFailure);
  return (error as LineWorkflowFailure).code;
}

describe("mandatory scoped interaction boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1000000001");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("checks session outside, then locks User then binding, revalidates, and only then runs the domain operation", async () => {
    const { calls, lockSql, lockValues, dependencies } = setup();
    await expect(runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, dependencies)).resolves.toEqual({ kind: "ack" });
    expect(calls).toEqual(["session", "outside:actor", "outside:self", "service",
      "lock:user", "lock:binding", "binding", "mapping", "actor", "self", "domain"]);
    // Parameterized; identifiers never appear in the SQL text.
    expect(lockSql).toEqual([
      "SELECT \"id\" FROM \"User\" WHERE \"id\" = ?::uuid FOR UPDATE",
      "SELECT \"id\" FROM \"LineAccountBinding\" WHERE \"id\" = ?::uuid FOR UPDATE",
    ]);
    expect(lockValues).toEqual([[USER_A], [BINDING]]);
    expect(mocks.cancellation).not.toHaveBeenCalled();
  });

  it("maps the finite keys to the two existing Patient SELF services, always with the trusted precondition", async () => {
    const { dependencies } = setup();
    await expect(runLineWorkflowScopedInteraction(seal(), "CANCELLATION_REQUEST", input, dependencies)).resolves.toEqual({ kind: "cancel" });
    expect(mocks.cancellation).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_A }), input,
      expect.objectContaining({ database: dependencies.database, beforeInteractionInTransaction: expect.any(Function) }));
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it("denies a shared quota before invoking the Appointment domain service", async () => {
    const { dependencies, rateLimiter } = setup();
    rateLimiter.consume.mockResolvedValue(false);
    expect(await codeOf(runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, dependencies))).toBe("RATE_LIMITED");
    expect(rateLimiter.consume).toHaveBeenCalledWith("ACKNOWLEDGE", USER_A, NOW);
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked binding", { binding: binding({ unlinkedAt: NOW }) }, "SCOPE_REVOKED"],
    ["advanced generation (relink)", { binding: binding({ lifecycleVersion: 3 }) }, "SCOPE_REVOKED"],
    ["missing binding", { binding: null }, "SCOPE_REVOKED"],
    ["binding of another User", { binding: binding({ userId: PERSON_A }) }, "SCOPE_REVOKED"],
    ["cleared LINE locator", { binding: binding({ lineUserId: null }) }, "SCOPE_REVOKED"],
    ["changed authSubject mapping", { mapped: null }, "SCOPE_SESSION_MISMATCH"],
  ])("reports a %s under the locks as itself, never as an idempotent or ordinary outcome", async (_label, overrides, code) => {
    const { calls, dependencies } = setup(overrides);
    expect(await codeOf(runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, dependencies))).toBe(code);
    expect(calls).not.toContain("domain");
  });

  it("denies when absolute expiry is reached while waiting for the locks", async () => {
    let clock = NOW.getTime();
    const { calls, dependencies } = setup({ lock: async () => {
      clock = NOW.getTime() + 15 * 60_000;
      return [];
    } });
    expect(await codeOf(runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, { ...dependencies, now: () => new Date(clock) })))
      .toBe("SCOPE_EXPIRED");
    expect(calls).not.toContain("domain");
  });

  it.each([
    ["the emergency kill switch", () => vi.stubEnv("DEMI_LINE_MINI_APP_DISABLED", "true"), () => seal(), "WORKFLOW_DISABLED"],
    ["a missing context", () => undefined, () => undefined, "SCOPE_MISSING"],
    ["a tampered context", () => undefined, () => `${seal().slice(0, -2)}AA`, "SCOPE_INVALID"],
    ["an expired context", () => undefined, () => seal(new Date(NOW.getTime() - 20 * 60_000)), "SCOPE_EXPIRED"],
  ] as Array<[string, () => void, () => string | undefined, string]>)("stops on %s before any session, database or service work", async (_label, arrange, credential, code) => {
    arrange();
    const { calls, dependencies } = setup();
    // The kill switch belongs to the default availability policy, not an injected channel.
    const policy = code === "WORKFLOW_DISABLED" ? { ...dependencies, configuration: undefined } : dependencies;
    expect(await codeOf(runLineWorkflowScopedInteraction(credential(), "ACKNOWLEDGE", input, policy))).toBe(code);
    expect(calls).toEqual([]);
  });

  it.each([
    ["another DEMI User", { userId: PERSON_A, sessionId: SESSION_A }],
    ["another session of the same User", { userId: USER_A, sessionId: "99999999-9999-4999-8999-999999999999" }],
  ])("denies %s after the live session check, with no service call", async (_label, session) => {
    const { calls, dependencies } = setup();
    const result = runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, {
      ...dependencies, liveSession: async () => ({ ...session, authSubject: AUTH_SUBJECT }),
    });
    expect(await codeOf(result)).toBe("SCOPE_SESSION_MISMATCH");
    expect(calls).toEqual([]);
  });

  it("rejects an actor other than the scoped User inside the precondition", async () => {
    const { transaction, dependencies } = setup();
    mocks.acknowledge.mockImplementation(async (_actor, _input, deps: { beforeInteractionInTransaction: AppointmentInteractionPrecondition }) => {
      await deps.beforeInteractionInTransaction(transaction as unknown as Prisma.TransactionClient, { userId: PERSON_A } as ActorContext)
        .catch(() => {
          throw new InfrastructureError();
        });
    });
    expect(await codeOf(runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, dependencies))).toBe("SCOPE_SESSION_MISMATCH");
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it("propagates a lock serialization failure unchanged, so the bounded retry reruns the precondition", async () => {
    const serialization = new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2010", clientVersion: "6.19.3", meta: { code: "40001" } });
    const { transaction, dependencies } = setup({ lock: async () => {
      throw serialization;
    } });
    let seen: unknown;
    mocks.acknowledge.mockImplementation(async (actor, _input, deps: { beforeInteractionInTransaction: AppointmentInteractionPrecondition }) => {
      seen = await deps.beforeInteractionInTransaction(transaction as unknown as Prisma.TransactionClient, actor).catch((error: unknown) => error);
      throw new ConflictError();
    });
    await expect(runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, dependencies)).rejects.toBeInstanceOf(ConflictError);
    expect(seen).toBe(serialization);
  });

  it("keeps existing domain conflict and infrastructure semantics", async () => {
    const { dependencies } = setup();
    mocks.acknowledge.mockRejectedValueOnce(new ConflictError());
    await expect(runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, dependencies)).rejects.toBeInstanceOf(ConflictError);
    mocks.acknowledge.mockRejectedValueOnce(new Error("raw driver text"));
    expect(await codeOf(runLineWorkflowScopedInteraction(seal(), "ACKNOWLEDGE", input, dependencies))).toBe("INFRASTRUCTURE_UNAVAILABLE");
  });
});
