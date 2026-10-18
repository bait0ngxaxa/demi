import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HospitalStatus, Prisma, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { createLineAccountIntent } from "@/modules/line/services/line-account-service";
import { initializeLineTermination, observeLineAuthorization } from "@/modules/line/services/line-authorization-lifecycle-service";
import { disconnectLineAccount } from "@/modules/line/services/line-disconnection-service";
import type { LineDisconnectionConfiguration } from "@/modules/line/services/line-disconnection-configuration";
import { lineChannelTupleKey, lineChannelTupleDefinition, type LineChannelInventory } from "@/modules/line/domain/line-authorization-lifecycle";
import { LineWorkflowFailure } from "@/modules/line/domain/line-workflow-errors";
import { createLineSubjectFingerprint } from "@/modules/line/services/line-identity-fingerprint";
import { hashLineSessionId } from "@/modules/line/services/line-session-service";
import { createLineWorkflowRateLimiter, lineWorkflowRateLimitInternals } from "@/modules/line/services/line-workflow-rate-limit";
import type { LineMiniAppConfiguration } from "@/modules/line/services/line-mini-app-configuration";
import { parseLineWorkflowContextKeyring, sealLineWorkflowContext } from "@/modules/line/services/line-workflow-context";
import {
  evaluateLineWorkflowEligibility,
  issueLineWorkflowContext,
  runLineWorkflowScopedRead,
  type LineWorkflowDependencies,
} from "@/modules/line/services/line-workflow-service";

const database = getPrisma();
const created = { people: [] as string[], users: [] as string[], hospitals: [] as string[] };
const rateLimitKeys: string[] = [];
const now = new Date();
const lineSubject = `U${randomBytes(16).toString("hex")}`;
const inventory: LineChannelInventory = { revision: "synthetic-inventory-b2.3", channels: [
  { kind: "ACCOUNT", providerReference: "provider:synthetic", channelId: "1000000001", environment: "ACCOUNT", deploymentReference: "deploy:it" },
  { kind: "MINI", providerReference: "provider:synthetic", channelId: "2000000001", environment: "DEVELOPING", deploymentReference: "deploy:it" },
] };
const accountTupleKey = lineChannelTupleKey(inventory.channels[0]);
const miniTupleKey = lineChannelTupleKey(inventory.channels[1]);
const disconnectionConfiguration: LineDisconnectionConfiguration = {
  inventory,
  accountLiffId: "1000000001-Account",
  appNames: { [accountTupleKey]: "DEMI synthetic", [miniTupleKey]: "DEMI MINI synthetic" },
  migrationEvidence: "synthetic", recoveryUatEvidence: "synthetic", providerCredentialEvidence: "synthetic",
  exactSessionEvidence: "synthetic", deploymentReference: "deploy:it",
};
const miniConfiguration: LineMiniAppConfiguration = {
  environment: "DEVELOPING", channelId: "2000000001", liffId: "2000000001-MiniDev",
  origin: "https://demi.example.org", endpointUrl: "https://demi.example.org/line/workflow", deploymentReference: "deploy:it",
};
const keyring = parseLineWorkflowContextKeyring(JSON.stringify({
  currentKid: "synthetic-it",
  keys: [{ kid: "synthetic-it", encryptionKey: randomBytes(32).toString("base64url"), sessionKey: randomBytes(32).toString("base64url") }],
}));

type Fixture = { userId: string; authSubject: string; sessionId: string; bindingId: string };

async function patient(): Promise<Fixture> {
  const hospital = await database.hospital.create({ data: {
    hospitalCode: `B23-${randomUUID().slice(0, 8)}`, name: "โรงพยาบาลสังเคราะห์ B2.3", status: HospitalStatus.ACTIVE,
  } });
  created.hospitals.push(hospital.id);
  const person = await database.person.create({ data: {
    identityKeyHash: createHash("sha256").update(randomUUID()).digest("hex"), givenName: "ทดสอบ", familyName: "Issuance",
  } });
  created.people.push(person.id);
  const authSubject = randomUUID();
  const user = await database.user.create({ data: { personId: person.id, authSubject, status: UserStatus.ACTIVE } });
  created.users.push(user.id);
  await database.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
  const profile = await database.patientProfile.create({ data: { personId: person.id } });
  await database.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId: hospital.id, hospitalNumber: "HN-B23-SYN" } });
  const fingerprint = createLineSubjectFingerprint(lineSubject);
  const binding = await database.lineAccountBinding.create({ data: {
    userId: user.id, lineUserId: lineSubject, lineSubjectFingerprint: fingerprint.fingerprint,
    lineSubjectFingerprintKeyId: fingerprint.keyId,
  } });
  return { userId: user.id, authSubject, sessionId: randomUUID(), bindingId: binding.id };
}

function workflowDependencies(fixture: Fixture, overrides: Partial<LineWorkflowDependencies> = {}): LineWorkflowDependencies {
  return {
    database,
    now: () => now,
    configuration: () => miniConfiguration,
    lifecycleInventory: async () => inventory,
    liveSession: async () => ({ userId: fixture.userId, sessionId: fixture.sessionId, authSubject: fixture.authSubject }),
    verifyIdentity: async () => ({ subject: lineSubject, verifiedAt: now, expiresAt: new Date(now.getTime() + 60 * 60_000) }),
    rateLimiter: { consume: async () => true },
    keyring: () => keyring,
    ...overrides,
  };
}

function disconnectionDependencies(fixture: Fixture) {
  return {
    database,
    now: () => now,
    configuration: disconnectionConfiguration,
    authorizationInventory: inventory,
    enforceRelinkPolicy: true,
    currentSession: async () => ({ userId: fixture.userId, sessionHash: hashLineSessionId(fixture.sessionId) }),
    liveSession: async () => ({ userId: fixture.userId, sessionId: fixture.sessionId, authSubject: fixture.authSubject, checkedAt: now }),
    freshIdentity: async () => ({ subject: lineSubject, verifiedAt: now, issuedAt: now, expiresAt: new Date(now.getTime() + 60_000) }),
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((finish) => { resolve = finish; });
  return { promise, resolve };
}

async function waitForBlockedUserLock(): Promise<void> {
  const deadline = Date.now() + 10_000;
  let activity: Array<{ state: string | null; waitEventType: string | null; waitEvent: string | null; query: string | null }> = [];
  while (Date.now() < deadline) {
    activity = await database.$queryRaw<Array<{ state: string | null; waitEventType: string | null; waitEvent: string | null; query: string | null }>>`SELECT state,
        wait_event_type AS "waitEventType", wait_event AS "waitEvent", left(query, 240) AS query
      FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'active'`;
    if (activity.some((entry) => entry.waitEventType === "Lock")) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`The competing transaction did not reach the User row lock: ${JSON.stringify(activity)}`);
}

async function failureCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!(error instanceof LineWorkflowFailure)) throw new Error(`Expected workflow denial, received ${String(error)}`);
  return error.code;
}

describe("LINE-QA.B2.3 issuance and Full Disconnection on PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" ||
        !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Local disposable PostgreSQL required");
    await database.$connect();
  });
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1000000001");
    vi.stubEnv("IDENTITY_HASH_SECRET", "synthetic-b2-3-identity-hash-secret-32-chars");
    vi.stubEnv("DEMI_LINE_MINI_APP_WORKFLOW_ENABLED", "true");
    vi.stubEnv("DEMI_LINE_MINI_APP_ISSUANCE_ENABLED", "true");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const keyHash of rateLimitKeys) {
      await database.$executeRaw`DELETE FROM "LineWorkflowRateLimitBucket" WHERE "keyHash" = ${keyHash}`;
    }
    rateLimitKeys.splice(0);
    await database.lineAuthorizationLifecycle.deleteMany({ where: { binding: { userId: { in: created.users } } } });
    await database.lineAccountActionIntent.deleteMany({ where: { userId: { in: created.users } } });
    await database.auditEvent.deleteMany({ where: { actorUserId: { in: created.users } } });
    await database.lineAccountBinding.deleteMany({ where: { userId: { in: created.users } } });
    await database.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: created.hospitals } } });
    await database.patientProfile.deleteMany({ where: { personId: { in: created.people } } });
    await database.userRole.deleteMany({ where: { userId: { in: created.users } } });
    await database.user.deleteMany({ where: { id: { in: created.users } } });
    await database.person.deleteMany({ where: { id: { in: created.people } } });
    await database.hospital.deleteMany({ where: { id: { in: created.hospitals } } });
    created.people.splice(0); created.users.splice(0); created.hospitals.splice(0);
  });
  afterAll(async () => database.$disconnect());

  it("commits MINI observation first when issuance owns User then Binding; Unlink waits, captures it and revokes the scope", async () => {
    const fixture = await patient();
    const dependencies = workflowDependencies(fixture);
    const eligibility = await evaluateLineWorkflowEligibility({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: "synthetic-mini-id-token" }, dependencies);
    const disconnect = disconnectionDependencies(fixture);
    const unlinkIntent = await createLineAccountIntent("UNLINK", disconnect);
    const entered = deferred();
    const release = deferred();
    const issue = database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${fixture.userId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${fixture.bindingId}::uuid FOR UPDATE`;
      await observeLineAuthorization(transaction, {
        ownerUserId: fixture.userId, bindingId: fixture.bindingId, bindingVersion: eligibility.bindingVersion,
      }, inventory, miniTupleKey, now);
      entered.resolve();
      await release.promise;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    await entered.promise;

    const unlinking = disconnectLineAccount(unlinkIntent, disconnect);
    try {
      await Promise.race([
        waitForBlockedUserLock(),
        unlinking.then(() => { throw new Error("Unlink completed before waiting on the issuance lock"); }),
      ]);
    } catch (error: unknown) {
      release.resolve();
      await Promise.allSettled([issue, unlinking]);
      throw error;
    }
    release.resolve();

    await issue;
    await unlinking;
    const context = sealLineWorkflowContext({
      bindingId: fixture.bindingId, bindingVersion: eligibility.bindingVersion, userId: fixture.userId,
      sessionId: fixture.sessionId, proofExpiresAt: eligibility.proofExpiresAt,
    }, { keyring, tuple: miniConfiguration, now });
    const lifecycle = await database.lineAuthorizationLifecycle.findMany({ where: { bindingId: fixture.bindingId }, orderBy: [{ bindingVersion: "asc" }, { tupleKey: "asc" }] });
    expect(lifecycle).toEqual(expect.arrayContaining([
      expect.objectContaining({ bindingVersion: 1, tupleKey: miniTupleKey, applicability: "OBSERVED", observedAt: now }),
      expect.objectContaining({ bindingVersion: 2, tupleKey: miniTupleKey, applicability: "OBSERVED", reason: "TOKEN_UNAVAILABLE", remoteOutcome: "REMOTE_UNCONFIRMED" }),
    ]));
    expect(await failureCode(runLineWorkflowScopedRead(context.value, async () => "must-not-read", dependencies))).toBe("SCOPE_REVOKED");
  }, 20_000);

  it("retries issuance on a fresh Serializable snapshot after Unlink commits, then denies without observing MINI", async () => {
    const fixture = await patient();
    const dependencies = workflowDependencies(fixture);
    const eligibility = await evaluateLineWorkflowEligibility({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: "synthetic-mini-id-token" }, dependencies);
    const entered = deferred();
    const release = deferred();
    const unlinkTransaction = database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${fixture.userId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${fixture.bindingId}::uuid FOR UPDATE`;
      const current = await transaction.lineAccountBinding.findUniqueOrThrow({ where: { id: fixture.bindingId } });
      const revoked = await transaction.lineAccountBinding.update({ where: { id: current.id }, data: {
        unlinkedAt: now, lifecycleVersion: { increment: 1 }, providerCleanupState: "PENDING",
      } });
      await initializeLineTermination(transaction, revoked, inventory, now);
      entered.resolve();
      await release.promise;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    await entered.promise;
    let attempts = 0;
    const countedDatabase = new Proxy(database, {
      get(target, property) {
        if (property === "$transaction") {
          return (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number }) => {
            attempts += 1;
            return target.$transaction(operation, options);
          };
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const issuance = failureCode(issueLineWorkflowContext(eligibility, { ...dependencies, database: countedDatabase }));
    await waitForBlockedUserLock();
    release.resolve();
    await unlinkTransaction;
    expect(await issuance).toBe("WORKFLOW_INELIGIBLE");
    expect(attempts).toBe(2);
    const rows = await database.lineAuthorizationLifecycle.findMany({ where: { bindingId: fixture.bindingId } });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ bindingVersion: 2, tupleKey: miniTupleKey, applicability: "UNKNOWN", observedAt: null, remoteOutcome: "REMOTE_UNCONFIRMED" }),
    ]));
    expect(rows.some((row) => row.bindingVersion === 1 && row.tupleKey === miniTupleKey)).toBe(false);
    expect(await database.auditEvent.count({ where: { actorUserId: fixture.userId, action: "line.lifecycle.observed" } })).toBe(0);
  });

  it("enforces one fixed-window user cap across independent limiter instances under concurrent requests", async () => {
    const principal = randomUUID();
    const keyHash = lineWorkflowRateLimitInternals.hashRateLimitKey("VERIFY_USER", principal);
    rateLimitKeys.push(keyHash);
    const firstInstance = createLineWorkflowRateLimiter(database);
    const secondInstance = createLineWorkflowRateLimiter(database);
    const results = await Promise.all(Array.from({ length: 40 }, (_unused, index) =>
      (index % 2 ? firstInstance : secondInstance).consume("VERIFY_USER", principal, now)));
    expect(results.filter(Boolean)).toHaveLength(10);
    const rows = await database.$queryRaw<Array<{ hitCount: number; keyHash: string }>>`SELECT "hitCount", "keyHash"
      FROM "LineWorkflowRateLimitBucket" WHERE "category" = 'VERIFY_USER' AND "keyHash" = ${keyHash}`;
    expect(rows).toEqual([{ hitCount: 11, keyHash }]);
    expect(rows[0].keyHash).not.toContain(principal);
    expect(await firstInstance.consume("VERIFY_USER", principal, new Date(now.getTime() + 5 * 60_000))).toBe(true);
  });

  it("can dispatch only the separately supplied MINI token against the exact observed MINI obligation", async () => {
    const fixture = await patient();
    await database.lineAuthorizationLifecycle.create({ data: {
      bindingId: fixture.bindingId, bindingVersion: 1, tupleKey: miniTupleKey,
      tupleDefinition: lineChannelTupleDefinition(inventory.channels[1]), applicability: "OBSERVED", evidenceReference: inventory.revision,
      observedAt: now,
    } });
    const dependencies = {
      ...disconnectionDependencies(fixture),
      miniDeauthorizationCredentials: () => ({ channelId: "2000000001", channelSecret: "synthetic-mini-secret-only", environment: "DEVELOPING" as const, deploymentReference: "deploy:it" }),
      terminate: async () => { throw new Error("Account deauthorization must not run without an Account token"); },
      terminateMini: async (token: string, subject: string, credentials: { channelId: string }, mayDispatch: () => Promise<boolean>) => {
        expect(token).toBe("synthetic-mini-user-access-token");
        expect(subject).toBe(lineSubject);
        expect(credentials.channelId).toBe("2000000001");
        expect(await mayDispatch()).toBe(true);
        return "PROVIDER_204" as const;
      },
    };
    const intent = await createLineAccountIntent("UNLINK", dependencies);
    await disconnectLineAccount({ ...intent, miniAccessToken: "synthetic-mini-user-access-token" }, dependencies);
    const rows = await database.lineAuthorizationLifecycle.findMany({ where: { bindingId: fixture.bindingId, bindingVersion: 2 } });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ tupleKey: miniTupleKey, applicability: "OBSERVED", remoteOutcome: "REMOTE_CONFIRMED", confirmedAt: now }),
      expect.objectContaining({ tupleKey: accountTupleKey, remoteOutcome: "REMOTE_UNCONFIRMED", reason: "TOKEN_UNAVAILABLE" }),
    ]));
    expect(JSON.stringify(rows)).not.toContain("synthetic-mini-user-access-token");
    expect(JSON.stringify(rows)).not.toContain("synthetic-mini-secret-only");
  });
});
