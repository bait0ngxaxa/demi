import { createHash, randomUUID } from "node:crypto";
import type { LineAccountBinding } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { createLineAccountIntent, linkLineAccount as linkLineAccountCore, verifyLineUnlinkCompletion } from "@/modules/line/services/line-account-service";
import { disconnectLineAccount, getLineDisconnectionStatus, prepareLineAccountRecovery, recoverLineAccount, type DisconnectionDependencies } from "@/modules/line/services/line-disconnection-service";
import { createLineSubjectFingerprint } from "@/modules/line/services/line-identity-fingerprint";
import { hashLineSessionId } from "@/modules/line/services/line-session-service";
import { recordLineTerminationOutcome, reserveLineTerminationAttempt, type LineAttemptTarget } from "@/modules/line/services/line-authorization-lifecycle-service";
import { lineChannelTupleDefinition, lineChannelTupleKey, type LineChannelInventory, type LineProviderEvidence } from "@/modules/line/domain/line-authorization-lifecycle";
import { deauthorizeLineAccount } from "@/modules/line/adapters/line-deauthorization-client";

const database = getPrisma();
const people: string[] = []; const users: string[] = [];
const now = new Date("2026-10-09T06:00:00Z"); const sessionId = randomUUID();
const subject = `U${"7".repeat(32)}`; const accessToken = "transient-access-token-not-persisted";
// Account-only deployment: MINI not provisioned, so no MINI obligation is created.
const inventory: LineChannelInventory = { channels: [{ kind: "ACCOUNT", channelId: "1234567890", environment: "ACCOUNT" }] };
const account = lineChannelTupleKey(inventory.channels[0]);
const mini = { kind: "MINI" as const, channelId: "2222222222", environment: "DEVELOPING" as const };

type LinkService = typeof linkLineAccountCore;
type LinkInput = Omit<Parameters<LinkService>[0], "currentPassword"> & { currentPassword?: string };
type LinkDependencies = NonNullable<Parameters<LinkService>[1]>;
const noLinkPasswordThrottle: NonNullable<LinkDependencies["attemptThrottle"]> = {
  isBlocked: async () => false,
  recordFailure: async () => undefined,
};

function linkLineAccount(input: LinkInput, dependencies: LinkDependencies) {
  return linkLineAccountCore(
    { ...input, currentPassword: input.currentPassword ?? "integration-current-password" },
    {
      ...dependencies,
      verifyCurrentPassword: dependencies.verifyCurrentPassword ?? (async () => undefined),
      attemptThrottle: dependencies.attemptThrottle ?? noLinkPasswordThrottle,
    },
  );
}

async function fixture(): Promise<LineAccountBinding> {
  const person = await database.person.create({ data: { identityKeyHash: createHash("sha256").update(randomUUID()).digest("hex"), givenName: "ทดสอบ", familyName: "Recovery" } }); people.push(person.id);
  const user = await database.user.create({ data: { personId: person.id, authSubject: randomUUID(), status: "ACTIVE" } }); users.push(user.id);
  const fp = createLineSubjectFingerprint(subject);
  return database.lineAccountBinding.create({ data: { userId: user.id, lineUserId: subject, lineSubjectFingerprint: fp.fingerprint, lineSubjectFingerprintKeyId: fp.keyId } });
}
function dependencies(binding: LineAccountBinding): DisconnectionDependencies {
  return { database, now: () => now, inventory, authorizationInventory: inventory, enforceRelinkPolicy: true,
    currentSession: async () => ({ userId: binding.userId, sessionHash: hashLineSessionId(sessionId) }),
    liveSession: async () => ({ userId: binding.userId, sessionId, authSubject: randomUUID(), checkedAt: now }),
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
async function otherUser() {
  const person = await database.person.create({ data: { identityKeyHash: createHash("sha256").update(randomUUID()).digest("hex"), givenName: "ทดสอบ", familyName: "บัญชีใหม่" } }); people.push(person.id);
  const user = await database.user.create({ data: { personId: person.id, authSubject: randomUUID(), status: "ACTIVE" } }); users.push(user.id);
  return user;
}
/** A different DEMI User in its own session on the same device and LINE account. */
function otherDependencies(userId: string): DisconnectionDependencies {
  const otherSessionId = randomUUID();
  return { ...dependencies({ userId } as LineAccountBinding),
    currentSession: async () => ({ userId, sessionHash: hashLineSessionId(otherSessionId) }),
    liveSession: async () => ({ userId, sessionId: otherSessionId, authSubject: randomUUID(), checkedAt: now }) };
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
    if (reason === "session") deps.liveSession = async () => ({ userId: binding.userId, sessionId: randomUUID(), authSubject: randomUUID(), checkedAt: now });
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
    if (reason === "inventory") deps.inventory = { channels: [...inventory.channels, mini] };
    if (reason === "owner inactive") await database.user.update({ where: { id: binding.userId }, data: { status: "SUSPENDED" } });
    if (reason === "provider unavailable") deps.liveSession = async () => { throw new Error("unavailable"); };
    await expect(recoverLineAccount(input, deps)).rejects.toThrow(); expect((await lifecycle(binding)).every((row) => !row.recoveryReleasedAt)).toBe(true);
  });
  it("new obligation invalidates the prepared decision", async () => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps); const input = await recoveryInput(binding, deps);
    await database.lineAuthorizationLifecycle.create({ data: { bindingId: binding.id, bindingVersion: 2, tupleKey: lineChannelTupleKey(mini), tupleDefinition: lineChannelTupleDefinition(mini), applicability: "UNKNOWN", evidenceReference: "test", requestedAt: now, reason: "TOKEN_UNAVAILABLE", remoteOutcome: "REMOTE_UNCONFIRMED" } });
    await expect(recoverLineAccount(input, deps)).rejects.toThrow();
  });
  it("Account proof releases reviewed independent unknown MINI history without claiming MINI removal", async () => {
    const binding = await fixture(); const deps = dependencies(binding);
    deps.inventory = { channels: [...inventory.channels, mini] };
    await unlink(binding, deps);
    expect((await prepareLineAccountRecovery(deps)).reviews.map((row) => row.appName).sort()).toEqual(["DEMI MINI App", "LINE Login ของ DEMI"]);
    await recoverLineAccount(await recoveryInput(binding, deps), deps);
    expect((await lifecycle(binding)).every((row) => row.recoveryReleasedAt && row.remoteOutcome === "REMOTE_UNCONFIRMED" && row.applicability === "UNKNOWN")).toBe(true);
  });
  it("another User can link after the owner's Full Disconnection while the owner's obligations stay on the owner's binding", async () => {
    const owner = await fixture(); const ownerDeps = dependencies(owner); await unlink(owner, ownerDeps);
    const pending = await lifecycle(owner);
    expect(pending.length).toBeGreaterThan(0);
    const person = await database.person.create({ data: { identityKeyHash: createHash("sha256").update(randomUUID()).digest("hex"), givenName: "ทดสอบ", familyName: "Transfer" } }); people.push(person.id);
    const other = await database.user.create({ data: { personId: person.id, authSubject: randomUUID(), status: "ACTIVE" } }); users.push(other.id);
    const otherDeps = dependencies({ ...owner, id: randomUUID(), userId: other.id });
    const intent = await createLineAccountIntent("LINK", otherDeps);
    const linked = await linkLineAccount({ ...intent, idToken: "fresh-proof" }, otherDeps);
    expect(linked.status).toBe("LINKED");
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } })).userId).toBe(other.id);
    // Never confirmed, cleared or moved by the transfer.
    expect((await lifecycle(owner)).map((row) => [row.id, row.remoteOutcome, row.recoveryReleasedAt])).toEqual(pending.map((row) => [row.id, row.remoteOutcome, row.recoveryReleasedAt]));
    await expect(createLineAccountIntent("LINK", ownerDeps)).rejects.toMatchObject({ code: "LINE_RECOVERY_REQUIRED" });
  });
  it("A's Full Disconnection without a MINI token leaves B ordinary Link and none of A's Recovery", async () => {
    const withMini: LineChannelInventory = { channels: [...inventory.channels, mini] };
    const owner = await fixture(); const ownerDeps = { ...dependencies(owner), inventory: withMini, authorizationInventory: withMini };
    ownerDeps.terminate = async () => "PROVIDER_204";
    const { result } = await unlink(owner, ownerDeps, accessToken);
    expect(result.disconnection).toMatchObject({ state: "RECOVERY_REQUIRED", canRelink: false });
    expect((await lifecycle(owner)).map((row) => row.remoteOutcome).sort()).toEqual(["REMOTE_CONFIRMED", "REMOTE_UNCONFIRMED"]);
    const ownerRecovery = await recoveryInput(owner, ownerDeps);
    const ownerHistory = await lifecycle(owner);

    const other = await otherUser();
    const otherDeps = { ...otherDependencies(other.id), inventory: withMini, authorizationInventory: withMini };
    expect(await getLineDisconnectionStatus(otherDeps)).toEqual({ state: "NONE", canRelink: true, obligations: [] });
    await expect(prepareLineAccountRecovery(otherDeps)).rejects.toThrow();
    await expect(recoverLineAccount(ownerRecovery, otherDeps)).rejects.toThrow();

    const linked = await linkLineAccount({ ...(await createLineAccountIntent("LINK", otherDeps)), idToken: "fresh-proof-B" }, otherDeps);
    expect(linked.status).toBe("LINKED");
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } })).toMatchObject({ userId: other.id, unlinkedAt: null });
    expect(await lifecycle(owner)).toEqual(ownerHistory);
    expect(await database.lineAuthorizationLifecycle.count({ where: { binding: { userId: other.id }, requestedAt: { not: null } } })).toBe(0);
    await expect(createLineAccountIntent("LINK", ownerDeps)).rejects.toMatchObject({ code: "LINE_RECOVERY_REQUIRED" });
    // Disconnection and transfer delete no User or Person.
    expect(await database.user.count({ where: { id: { in: [owner.userId, other.id] }, status: "ACTIVE" } })).toBe(2);
    expect(await database.person.count({ where: { id: { in: people } } })).toBe(people.length);
  });
  it("late A deauthorization after B links settles only A history and never B's binding or menu", async () => {
    const owner = await fixture(); const ownerDeps = dependencies(owner); await unlink(owner, ownerDeps);
    const attempt = await runSerializableTransaction(database, (transaction) => reserveLineTerminationAttempt(transaction, { ownerUserId: owner.userId, bindingId: owner.id, bindingVersion: 2, tupleKey: account }, inventory, now));
    if (!attempt) throw new Error("Expected A attempt");
    const other = await otherUser(); const otherDeps = otherDependencies(other.id);
    const linked = await linkLineAccount({ ...(await createLineAccountIntent("LINK", otherDeps)), idToken: "fresh-proof-B" }, otherDeps);
    const bindingB = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } });
    const lifecycleB = await database.lineAuthorizationLifecycle.findMany({ where: { bindingId: linked.bindingId } });
    expect(await runSerializableTransaction(database, (transaction) => recordLineTerminationOutcome(transaction, attempt, "PROVIDER_204", now))).toBe(true);
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } })).toEqual(bindingB);
    expect(await database.lineAuthorizationLifecycle.findMany({ where: { bindingId: linked.bindingId } })).toEqual(lifecycleB);
    // A's retired cleanup locator cannot reset B's Rich Menu.
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({ userId: owner.userId, lineUserId: null, providerCleanupState: "CONFIRMED_CLEAN" });
    expect((await lifecycle(owner)).find((row) => row.attemptId === attempt.attemptId)).toMatchObject({ remoteOutcome: "REMOTE_CONFIRMED" });
  });
  it("same-user relink reviews only the new generation; released history is never prompted again", async () => {
    const withMini: LineChannelInventory = { channels: [...inventory.channels, mini] };
    const binding = await fixture(); const deps = { ...dependencies(binding), inventory: withMini, authorizationInventory: withMini };
    await unlink(binding, deps);
    const first = await recoveryInput(binding, deps);
    expect(Object.keys(first.manualReviews)).toHaveLength(2);
    await recoverLineAccount(first, deps);
    await linkLineAccount({ ...(await createLineAccountIntent("LINK", deps)), idToken: "relink-proof" }, deps);
    await unlink(binding, deps);
    // Safeguard retained: the new generation's unconfirmed MINI permission still needs Recovery.
    await expect(createLineAccountIntent("LINK", deps)).rejects.toMatchObject({ code: "LINE_RECOVERY_REQUIRED" });
    const second = await prepareLineAccountRecovery(deps);
    const generations = new Map((await lifecycle(binding)).map((row) => [row.id, row.bindingVersion]));
    expect(second.reviews.map((row) => generations.get(row.id))).toEqual([4, 4]);
    expect(second.reviews.some((row) => row.id in first.manualReviews)).toBe(false);
    await recoverLineAccount({ intentId: second.intentId, challenge: second.challenge, idToken: "fresh-id-token-synthetic", riskAcknowledged: true,
      manualReviews: Object.fromEntries(second.reviews.map((row) => [row.id, "NOT_LISTED" as const])) }, deps);
    expect(await getLineDisconnectionStatus(deps)).toMatchObject({ state: "RECOVERY_RELEASED_UNVERIFIED", canRelink: true });
    await expect(prepareLineAccountRecovery(deps)).rejects.toThrow();
  });
  it("UNLINK intents stay single-use and session-bound across replay, expiry, session change and refresh", async () => {
    const binding = await fixture(); const deps = dependencies(binding); deps.terminate = vi.fn(async (): Promise<LineProviderEvidence> => "PROVIDER_204");
    const otherSession = randomUUID();
    const changedSession = { ...deps, currentSession: async () => ({ userId: binding.userId, sessionHash: hashLineSessionId(otherSession) }) };
    const fromOldSession = await createLineAccountIntent("UNLINK", deps);
    await expect(disconnectLineAccount({ ...fromOldSession, accessToken }, changedSession)).rejects.toMatchObject({ code: "LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED" });
    const stale = await createLineAccountIntent("UNLINK", deps);
    await database.lineAccountActionIntent.update({ where: { id: stale.intentId }, data: { expiresAt: now } });
    await expect(disconnectLineAccount({ ...stale, accessToken }, deps)).rejects.toMatchObject({ code: "LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED" });
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).toMatchObject({ unlinkedAt: null, lifecycleVersion: 1 });
    expect(deps.terminate).not.toHaveBeenCalled();

    const { intent } = await unlink(binding, deps, accessToken);
    const committed = { binding: await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } }), rows: await lifecycle(binding) };
    await expect(disconnectLineAccount({ ...intent, accessToken }, deps)).rejects.toMatchObject({ code: "LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED" });
    // A refreshed page cannot start a second Disconnection for the revoked binding.
    await expect(createLineAccountIntent("UNLINK", deps)).rejects.toThrow();
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).toEqual(committed.binding);
    expect(await lifecycle(binding)).toEqual(committed.rows);
    expect(deps.terminate).toHaveBeenCalledOnce();
    expect(await database.auditEvent.count({ where: { action: "line.account.unlinked", resourceId: binding.id } })).toBe(1);
  });
  it("final sign-out evidence binds the committed UNLINK to the exact User and session", async () => {
    const binding = await fixture(); const deps = dependencies(binding);
    const pending = await createLineAccountIntent("UNLINK", deps);
    // Before commit (lost or slow response): no evidence, and checking never unlinks.
    expect(await verifyLineUnlinkCompletion(pending, deps)).toBe("NOT_COMMITTED");
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).toMatchObject({ unlinkedAt: null, lifecycleVersion: 1 });
    const { intent } = await unlink(binding, deps);
    expect(await verifyLineUnlinkCompletion(intent, deps)).toBe("COMMITTED");
    // Another tab switched the browser to User B, or A signed in again with a new session.
    const other = await otherUser();
    expect(await verifyLineUnlinkCompletion(intent, otherDependencies(other.id))).toBe("SESSION_CHANGED");
    const newSession = randomUUID();
    expect(await verifyLineUnlinkCompletion(intent, { ...deps, currentSession: async () => ({ userId: binding.userId, sessionHash: hashLineSessionId(newSession) }) })).toBe("SESSION_CHANGED");
    // Proof cannot be guessed, borrowed from a LINK intent, or reused indefinitely.
    await expect(verifyLineUnlinkCompletion({ ...intent, challenge: "x".repeat(43) }, deps)).rejects.toThrow();
    const linkIntent = await createLineAccountIntent("LINK", otherDependencies(other.id));
    await expect(verifyLineUnlinkCompletion(linkIntent, otherDependencies(other.id))).rejects.toThrow();
    expect(await verifyLineUnlinkCompletion(intent, { ...deps, now: () => new Date(now.getTime() + 15 * 60_000 + 1) })).toBe("PROOF_EXPIRED");
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).toMatchObject({ lifecycleVersion: 2 });
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
  it("unavailable configuration never waives durable pending records; only Recovery restores Link", async () => {
    const binding = await fixture(); const deps = dependencies(binding); await unlink(binding, deps);
    const unavailable = { ...deps, authorizationInventory: undefined, enforceRelinkPolicy: true };
    await expect(createLineAccountIntent("LINK", unavailable)).rejects.toMatchObject({ code: "LINE_CONFIGURATION_MISSING" });
    await expect(createLineAccountIntent("LINK", deps)).rejects.toMatchObject({ code: "LINE_RECOVERY_REQUIRED" });
    await recoverLineAccount(await recoveryInput(binding, deps), deps);
    await expect(createLineAccountIntent("LINK", unavailable)).rejects.toMatchObject({ code: "LINE_CONFIGURATION_MISSING" });
    expect(await createLineAccountIntent("LINK", deps)).toHaveProperty("intentId");
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
    deps.now = () => new Date(now.getTime() + 10001); deps.liveSession = async () => ({ userId: binding.userId, sessionId, authSubject: randomUUID(), checkedAt: deps.now?.() ?? now });
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
