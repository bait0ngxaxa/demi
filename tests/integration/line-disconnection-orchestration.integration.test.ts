import { createHash, randomUUID } from "node:crypto";
import type { LineAccountBinding } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { createLineAccountIntent, linkLineAccount } from "@/modules/line/services/line-account-service";
import { disconnectLineAccount, getLineDisconnectionStatus, prepareLineAccountRecovery, recoverLineAccount, type DisconnectionDependencies } from "@/modules/line/services/line-disconnection-service";
import { createLineSubjectFingerprint } from "@/modules/line/services/line-identity-fingerprint";
import { hashLineSessionId } from "@/modules/line/services/line-session-service";
import { recordLineTerminationOutcome, reserveLineTerminationAttempt, type LineAttemptTarget, type LineProviderEvidence } from "@/modules/line/services/line-authorization-lifecycle-service";
import { lineChannelTupleKey } from "@/modules/line/domain/line-authorization-lifecycle";
import type { LineDisconnectionConfiguration } from "@/modules/line/services/line-disconnection-configuration";
import { deauthorizeLineAccount } from "@/modules/line/adapters/line-deauthorization-client";

const database = getPrisma();
const people: string[] = []; const users: string[] = [];
const now = new Date("2026-10-09T06:00:00Z"); const sessionId = randomUUID();
const subject = `U${"7".repeat(32)}`; const accessToken = "transient-access-token-not-persisted";
const inventory: LineDisconnectionConfiguration["inventory"] = { revision: "synthetic-v1", miniExclusionReference: "synthetic-reviewed-not-provisioned", channels: [
  { kind: "ACCOUNT", providerReference: "synthetic-provider", channelId: "1234567890", environment: "ACCOUNT", deploymentReference: "integration" },
] };
const account = lineChannelTupleKey(inventory.channels[0]);
const config: LineDisconnectionConfiguration = { inventory, accountLiffId: "1234567890-test", appNames: { [account]: "DEMI ทดสอบ" }, migrationEvidence: "test", recoveryUatEvidence: "test", providerCredentialEvidence: "test", exactSessionEvidence: "test", deploymentReference: "integration" };

async function fixture(): Promise<LineAccountBinding> {
  const person = await database.person.create({ data: { identityKeyHash: createHash("sha256").update(randomUUID()).digest("hex"), givenName: "ทดสอบ", familyName: "Recovery" } }); people.push(person.id);
  const user = await database.user.create({ data: { personId: person.id, authSubject: randomUUID(), status: "ACTIVE" } }); users.push(user.id);
  const fp = createLineSubjectFingerprint(subject);
  return database.lineAccountBinding.create({ data: { userId: user.id, lineUserId: subject, lineSubjectFingerprint: fp.fingerprint, lineSubjectFingerprintKeyId: fp.keyId } });
}
function dependencies(binding: LineAccountBinding): DisconnectionDependencies {
  return { database, now: () => now, configuration: config, authorizationInventory: inventory, enforceRelinkPolicy: true,
    currentSession: async () => ({ userId: binding.userId, sessionHash: hashLineSessionId(sessionId) }),
    liveSession: async () => ({ userId: binding.userId, sessionId, checkedAt: now }),
    verifyIdentity: async () => ({ subject, expiresAt: new Date(now.getTime() + 60_000) }),
    freshIdentity: async () => ({ subject, verifiedAt: now, issuedAt: now, expiresAt: new Date(now.getTime() + 60_000) }) };
}
async function unlink(binding: LineAccountBinding, deps = dependencies(binding), token?: string) {
  const intent = await createLineAccountIntent("UNLINK", deps);
  const result = await disconnectLineAccount({ ...intent, ...(token ? { accessToken: token } : {}) }, deps);
  return { intent, result };
}
async function recoveryInput(binding: LineAccountBinding, deps = dependencies(binding)) {
  const prepared = await prepareLineAccountRecovery(deps);
  return { intentId: prepared.intentId, challenge: prepared.challenge, idToken: "fresh-id-token-synthetic", riskAcknowledged: true as const,
    manualReviews: Object.fromEntries(prepared.reviews.map((row) => [row.id, "UNDETERMINED" as const])) };
}
async function lifecycle(binding: LineAccountBinding) { return database.lineAuthorizationLifecycle.findMany({ where: { bindingId: binding.id }, orderBy: { bindingVersion: "asc" } }); }

describe("17J.3D executable Account disconnection/recovery PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Local disposable PostgreSQL required");
    await database.$connect();
  });
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890"); vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "synthetic-integration-identity-secret-32-chars"); vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_SECRET", "synthetic-account-channel-secret");
    vi.stubEnv("DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED", "true");
  });
  afterEach(async () => {
    await database.lineAuthorizationLifecycle.deleteMany({ where: { binding: { userId: { in: users } } } });
    await database.lineAccountActionIntent.deleteMany({ where: { userId: { in: users } } }); await database.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await database.lineAccountBinding.deleteMany({ where: { userId: { in: users } } }); await database.user.deleteMany({ where: { id: { in: users } } }); await database.person.deleteMany({ where: { id: { in: people } } });
    users.splice(0); people.splice(0); vi.unstubAllEnvs();
  });
  afterAll(async () => database.$disconnect());

  it("commits local revocation/intent/audit before channel-correct remote 204, with no network under locks", async () => {
    const binding = await fixture(); const deps = dependencies(binding);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const saved = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
      expect(saved.unlinkedAt).toEqual(now); expect(saved.lifecycleVersion).toBe(2);
      expect(await database.lineAccountActionIntent.count({ where: { userId: binding.userId, action: "UNLINK", consumedAt: { not: null } } })).toBe(1);
      const locked = await database.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::integer AS count FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction'`;
      expect(locked[0].count).toBe(0);
      if (String(url).includes("/verify")) return Response.json({ client_id: "1234567890", expires_in: 60, scope: "openid" });
      if (String(url).includes("/userinfo")) return Response.json({ sub: subject });
      if (String(url).includes("/token")) return Response.json({ access_token: "synthetic-channel-token", token_type: "Bearer", expires_in: 900 });
      return new Response(null, { status: 204 });
    });
    deps.terminate = (token, expected, fence) => deauthorizeLineAccount(token, expected, fence, fetcher);
    const { result, intent } = await unlink(binding, deps, accessToken);
    expect(result.disconnection?.state).toBe("REMOTE_CONFIRMED"); expect(fetcher).toHaveBeenCalledTimes(4);
    await expect(disconnectLineAccount({ ...intent, accessToken }, deps)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(4);
    const persisted = JSON.stringify([await lifecycle(binding), await database.auditEvent.findMany({ where: { actorUserId: binding.userId } }), await database.lineAccountActionIntent.findMany({ where: { userId: binding.userId } })]);
    expect(persisted).not.toContain(accessToken); expect(persisted).not.toContain("synthetic-channel-token"); expect(persisted).not.toContain(subject);
    const linkIntent = await createLineAccountIntent("LINK", deps);
    expect(await linkLineAccount({ ...linkIntent, idToken: "new-proof" }, deps)).toMatchObject({ status: "LINKED", lifecycleVersion: 3 });
  });
  it.each(["KNOWN_NOT_DISPATCHED", "POSSIBLY_DISPATCHED", "PROVIDER_REJECTED", "INVALID_RESPONSE"] as const)("keeps local unlink authoritative with %s and permits authenticated no-old-token Recovery", async (outcome) => {
    const binding = await fixture(); const deps = dependencies(binding); deps.terminate = async () => outcome;
    const { result } = await unlink(binding, deps, accessToken);
    expect(result.disconnection?.state).toBe("RECOVERY_REQUIRED"); expect(result.disconnection?.canRelink).toBe(false);
    await expect(createLineAccountIntent("LINK", deps)).rejects.toMatchObject({ code: "LINE_RECOVERY_REQUIRED" });
    const input = await recoveryInput(binding, deps);
    expect(await recoverLineAccount(input, deps)).toEqual({ status: "RECOVERY_RELEASED_UNVERIFIED" });
    const saved = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } }); expect(saved.unlinkedAt).toEqual(now); expect(saved.lifecycleVersion).toBe(2);
    expect((await lifecycle(binding))[0]).toMatchObject({ remoteOutcome: "REMOTE_UNCONFIRMED", reason: outcome, recoveryReleasedAt: now });
    expect((await getLineDisconnectionStatus(deps)).state).toBe("RECOVERY_RELEASED_UNVERIFIED");
    const intent = await createLineAccountIntent("LINK", deps);
    expect(await linkLineAccount({ ...intent, idToken: "separate-proof" }, deps)).toMatchObject({ status: "LINKED", lifecycleVersion: 3 });
    await expect(recoverLineAccount(input, deps)).rejects.toThrow();
  });
  it("missing token never blocks unlink or dispatches; no-old-token Recovery grants no Patient/binding authority", async () => {
    const binding = await fixture(); const deps = dependencies(binding); deps.terminate = vi.fn();
    const { result } = await unlink(binding, deps); expect(result.disconnection?.state).toBe("RECOVERY_REQUIRED"); expect(deps.terminate).not.toHaveBeenCalled();
    await recoverLineAccount(await recoveryInput(binding, deps), deps);
    expect((await lifecycle(binding))[0]).toMatchObject({ attemptId: null, reason: "TOKEN_UNAVAILABLE", remoteOutcome: "REMOTE_UNCONFIRMED" });
    expect(await database.lineAccountBinding.count({ where: { userId: binding.userId, unlinkedAt: null } })).toBe(0);
    expect(await database.userRole.count({ where: { userId: binding.userId } })).toBe(0);
  });
  it("legacy revoked binding without rows is lazily initialized and recoverable without fabricated success", async () => {
    const binding = await fixture(); await database.lineAccountBinding.update({ where: { id: binding.id }, data: { unlinkedAt: now, lineUserId: null } });
    const deps = dependencies(binding); expect((await getLineDisconnectionStatus(deps)).state).toBe("RECOVERY_REQUIRED");
    await recoverLineAccount(await recoveryInput(binding, deps), deps);
    expect((await lifecycle(binding))[0]).toMatchObject({ bindingVersion: 1, remoteOutcome: "REMOTE_UNCONFIRMED", recoveryReleasedAt: now });
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).lifecycleVersion).toBe(1);
  });
  it.each(["session", "wrong LINE", "expired proof", "old proof", "future proof", "missing review", "extra review", "no risk", "challenge", "consumed", "expired intent", "binding version", "inventory", "owner inactive", "provider unavailable"])("fails Recovery closed for %s", async (reason) => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps);
    const input = await recoveryInput(binding, deps);
    if (reason === "session") deps.liveSession = async () => ({ userId: binding.userId, sessionId: randomUUID(), checkedAt: now });
    if (reason === "wrong LINE") deps.freshIdentity = async () => ({ subject: `U${"8".repeat(32)}`, verifiedAt: now, issuedAt: now, expiresAt: new Date(now.getTime() + 60000) });
    if (reason === "expired proof") deps.freshIdentity = async () => ({ subject, verifiedAt: now, issuedAt: now, expiresAt: now });
    if (reason === "old proof") deps.freshIdentity = async () => ({ subject, verifiedAt: new Date(now.getTime() - 600000), issuedAt: now, expiresAt: new Date(now.getTime() + 60000) });
    if (reason === "future proof") deps.freshIdentity = async () => ({ subject, verifiedAt: now, issuedAt: new Date(now.getTime() + 1000), expiresAt: new Date(now.getTime() + 60000) });
    if (reason === "missing review") input.manualReviews = {};
    if (reason === "extra review") input.manualReviews[randomUUID()] = "UNDETERMINED";
    if (reason === "no risk") Object.assign(input, { riskAcknowledged: false });
    if (reason === "challenge") input.challenge = "x".repeat(43);
    if (reason === "consumed") await database.lineAccountActionIntent.update({ where: { id: input.intentId }, data: { consumedAt: now, outcome: "SUCCEEDED" } });
    if (reason === "expired intent") await database.lineAccountActionIntent.update({ where: { id: input.intentId }, data: { expiresAt: now } });
    if (reason === "binding version") await database.lineAccountBinding.update({ where: { id: binding.id }, data: { lifecycleVersion: { increment: 1 } } });
    if (reason === "inventory") deps.configuration = { ...config, inventory: { ...inventory, revision: "synthetic-v2" } };
    if (reason === "owner inactive") await database.user.update({ where: { id: binding.userId }, data: { status: "SUSPENDED" } });
    if (reason === "provider unavailable") deps.liveSession = async () => { throw new Error("unavailable"); };
    await expect(recoverLineAccount(input, deps)).rejects.toThrow(); expect((await lifecycle(binding)).every((row) => !row.recoveryReleasedAt)).toBe(true);
  });
  it("new obligation invalidates the prepared decision", async () => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps); const input = await recoveryInput(binding, deps);
    const mini = { kind: "MINI" as const, providerReference: "synthetic-provider", channelId: "2222222222", environment: "DEVELOPING" as const, deploymentReference: "integration" };
    await database.lineAuthorizationLifecycle.create({ data: { bindingId: binding.id, bindingVersion: 2, tupleKey: lineChannelTupleKey(mini), tupleDefinition: JSON.stringify([mini.providerReference, mini.kind, mini.channelId, mini.environment, mini.deploymentReference]), applicability: "UNKNOWN", evidenceReference: "test", requestedAt: now, reason: "TOKEN_UNAVAILABLE", remoteOutcome: "REMOTE_UNCONFIRMED" } });
    await expect(recoverLineAccount(input, deps)).rejects.toThrow();
  });
  it("Account proof releases reviewed independent unknown MINI history without claiming MINI removal", async () => {
    const binding = await fixture(); const deps = dependencies(binding);
    const mini = { kind: "MINI" as const, providerReference: "synthetic-provider", channelId: "2222222222", environment: "DEVELOPING" as const, deploymentReference: "integration" };
    deps.configuration = { ...config, inventory: { revision: "with-mini", channels: [...inventory.channels, mini] }, appNames: { ...config.appNames, [lineChannelTupleKey(mini)]: "DEMI ทดสอบ MINI" } };
    await unlink(binding, deps); await recoverLineAccount(await recoveryInput(binding, deps), deps);
    expect((await lifecycle(binding)).every((row) => row.recoveryReleasedAt && row.remoteOutcome === "REMOTE_UNCONFIRMED" && row.applicability === "UNKNOWN")).toBe(true);
  });
  it("idempotent already-linked completion cannot bypass pending obligations", async () => {
    const binding = await fixture(); const deps = dependencies(binding); const intent = await createLineAccountIntent("LINK", deps);
    await unlink(binding, deps); await database.lineAccountBinding.update({ where: { id: binding.id }, data: { unlinkedAt: null, providerCleanupState: null } });
    await expect(linkLineAccount({ ...intent, idToken: "proof" }, deps)).rejects.toMatchObject({ code: "LINE_RECOVERY_REQUIRED" });
  });
  it("a prepared ordinary Link intent cannot bypass a concurrent Unlink", async () => {
    const binding = await fixture(); const deps = dependencies(binding); const intent = await createLineAccountIntent("LINK", deps);
    await unlink(binding, deps);
    await expect(linkLineAccount({ ...intent, idToken: "proof" }, deps)).rejects.toMatchObject({ code: "LINE_RECOVERY_REQUIRED" });
  });
  it("concurrent unlink requests commit/dispatch only once", async () => {
    const binding = await fixture(); const deps = dependencies(binding); const terminate = vi.fn(async (): Promise<LineProviderEvidence> => "POSSIBLY_DISPATCHED"); deps.terminate = terminate;
    const intent = await createLineAccountIntent("UNLINK", deps);
    const results = await Promise.allSettled([disconnectLineAccount({ ...intent, accessToken }, deps), disconnectLineAccount({ ...intent, accessToken }, deps)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1); expect(terminate).toHaveBeenCalledOnce();
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).lifecycleVersion).toBe(2);
  });
  it("concurrent Recovery consumes once and audits once", async () => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps); const input = await recoveryInput(binding, deps);
    const results = await Promise.allSettled([recoverLineAccount(input, deps), recoverLineAccount(input, deps)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await database.auditEvent.count({ where: { actorUserId: binding.userId, action: "line.lifecycle.recovery.released" } })).toBe(1);
  });
  it("concurrent Recovery and Relink preserve release-before-binding authority", async () => {
    const binding = await fixture(); const deps = dependencies(binding);
    const linkIntent = await createLineAccountIntent("LINK", deps);
    await unlink(binding, deps); const input = await recoveryInput(binding, deps);
    const results = await Promise.allSettled([recoverLineAccount(input, deps), linkLineAccount({ ...linkIntent, idToken: "new-proof" }, deps)]);
    expect(results[0].status).toBe("fulfilled");
    const saved = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect((await lifecycle(binding))[0].recoveryReleasedAt).toEqual(now);
    if (results[1].status === "fulfilled") expect(saved).toMatchObject({ unlinkedAt: null, lifecycleVersion: 3 });
    else {
      expect(saved).toMatchObject({ unlinkedAt: now, lifecycleVersion: 2 });
      const next = await createLineAccountIntent("LINK", deps);
      await expect(linkLineAccount({ ...next, idToken: "new-proof" }, deps)).resolves.toMatchObject({ lifecycleVersion: 3 });
    }
  });
  it("disabled rollout cannot waive durable pending records; never-activated legacy behavior stays available", async () => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps);
    const runtimeStaged = { ...deps, authorizationInventory: undefined, enforceRelinkPolicy: true };
    await expect(createLineAccountIntent("LINK", runtimeStaged)).rejects.toMatchObject({ code: "LINE_RECOVERY_REQUIRED" });
    await recoverLineAccount(await recoveryInput(binding, deps), deps);
    expect(await createLineAccountIntent("LINK", runtimeStaged)).toHaveProperty("intentId");
  });
  it("expired fresh proof during a final Link lock wait cannot yield idempotent success", async () => {
    const binding = await fixture(); const deps = dependencies(binding); const intent = await createLineAccountIntent("LINK", deps);
    deps.verifyIdentity = async () => ({ subject, expiresAt: now });
    await expect(linkLineAccount({ ...intent, idToken: "expired-at-commit" }, deps)).rejects.toMatchObject({ code: "LINE_TOKEN_INVALID_OR_EXPIRED" });
  });
  it("crashed reservation never redispatches and becomes recoverable after the bounded attempt deadline", async () => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps);
    const target = { ownerUserId: binding.userId, bindingId: binding.id, bindingVersion: 2, tupleKey: account };
    await runSerializableTransaction(database, (transaction) => reserveLineTerminationAttempt(transaction, target, inventory, now));
    await expect(prepareLineAccountRecovery(deps)).rejects.toThrow();
    expect(await runSerializableTransaction(database, (transaction) => reserveLineTerminationAttempt(transaction, target, inventory, now))).toBeNull();
    deps.now = () => new Date(now.getTime() + 10001); deps.liveSession = async () => ({ userId: binding.userId, sessionId, checkedAt: deps.now?.() ?? now });
    deps.freshIdentity = async () => ({ subject, verifiedAt: deps.now?.() ?? now, issuedAt: deps.now?.(), expiresAt: new Date(now.getTime() + 60000) });
    await recoverLineAccount(await recoveryInput(binding, deps), deps);
    expect((await lifecycle(binding))[0]).toMatchObject({ reason: "ATTEMPT_RESERVED", settledAt: null, recoveryReleasedAt: deps.now() });
  });
  it("late A evidence after Recovery/new B changes only A history, retaining audit and current generation", async () => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps);
    const attempt = await runSerializableTransaction(database, (transaction) => reserveLineTerminationAttempt(transaction, { ownerUserId: binding.userId, bindingId: binding.id, bindingVersion: 2, tupleKey: account }, inventory, now));
    if (!attempt) throw new Error("Expected A");
    await runSerializableTransaction(database, (transaction) => recordLineTerminationOutcome(transaction, attempt, "POSSIBLY_DISPATCHED", now));
    await recoverLineAccount(await recoveryInput(binding, deps), deps); const before = (await lifecycle(binding))[0];
    const intent = await createLineAccountIntent("LINK", deps); await linkLineAccount({ ...intent, idToken: "proof-B" }, deps);
    const bindingB = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    await runSerializableTransaction(database, (transaction) => recordLineTerminationOutcome(transaction, attempt, "PROVIDER_204", now));
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).toEqual(bindingB);
    expect((await lifecycle(binding))[0]).toMatchObject({ recoveryDecisionAuditId: before.recoveryDecisionAuditId, recoveryReleasedAt: now, remoteOutcome: "REMOTE_CONFIRMED" });
    expect((await getLineDisconnectionStatus(deps)).state).toBe("RECOVERY_RELEASED_UNVERIFIED");
    await expect(runSerializableTransaction(database, (transaction) => reserveLineTerminationAttempt(transaction, attempt, inventory, now))).rejects.toThrow();
  });
  it("concurrent reservation/completion can settle only the exact original attempt", async () => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps);
    const target = { ownerUserId: binding.userId, bindingId: binding.id, bindingVersion: 2, tupleKey: account };
    const attempts = await Promise.all([runSerializableTransaction(database, (transaction) => reserveLineTerminationAttempt(transaction, target, inventory, now)), runSerializableTransaction(database, (transaction) => reserveLineTerminationAttempt(transaction, target, inventory, now))]);
    expect(attempts.filter(Boolean)).toHaveLength(1); const attempt = attempts.find((entry): entry is LineAttemptTarget => entry !== null); if (!attempt) throw new Error();
    const results = await Promise.all([runSerializableTransaction(database, (transaction) => recordLineTerminationOutcome(transaction, attempt, "PROVIDER_204", now)), runSerializableTransaction(database, (transaction) => recordLineTerminationOutcome(transaction, attempt, "PROVIDER_204", now))]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
