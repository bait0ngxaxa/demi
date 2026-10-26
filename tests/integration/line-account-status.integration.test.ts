import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { checkOwnLineAccountStatus, LineAccountStatusRateLimited } from "@/modules/line/services/line-account-status-service";
import { createLineWorkflowRateLimiter, lineWorkflowRateLimitInternals } from "@/modules/line/services/line-workflow-rate-limit";

const first = new PrismaClient();
const second = new PrismaClient(); // Separate connection pool, like another server instance.
const people: string[] = [];
const users: string[] = [];
const hospitals: string[] = [];
const now = new Date();
const subject = "U" + "a".repeat(32);
const tokens = { idToken: "synthetic-proof", accessToken: "synthetic-access" };
async function fixture(): Promise<{ userId: string; bindingId: string }> {
  const person = await first.person.create({ data: { identityKeyHash: createHash("sha256").update(randomUUID()).digest("hex"), givenName: "ทดสอบ", familyName: "Status" } });
  people.push(person.id);
  const user = await first.user.create({ data: { personId: person.id, authSubject: randomUUID(), status: "ACTIVE" } }); users.push(user.id);
  const hospital = await first.hospital.create({ data: { hospitalCode: `STATUS-${randomUUID().slice(0, 8)}`, name: "โรงพยาบาลสังเคราะห์", status: "ACTIVE" } }); hospitals.push(hospital.id);
  await first.userRole.create({ data: { userId: user.id, role: "HOSPITAL" } });
  await first.hospitalMembership.create({ data: { userId: user.id, hospitalId: hospital.id, membershipType: "MEMBER", status: "ACTIVE" } });
  const binding = await first.lineAccountBinding.create({ data: { userId: user.id, lineUserId: subject, lineSubjectFingerprint: createHash("sha256").update(subject).digest("hex"), lineSubjectFingerprintKeyId: "synthetic" } });
  return { userId: user.id, bindingId: binding.id };
}
function provider(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/oauth2/v2.1/verify") && init?.method === "POST") return Response.json({ iss: "https://access.line.me", sub: subject, aud: "1234567890", exp: Math.floor(Date.now() / 1000) + 3600 });
    if (path.includes("/oauth2/v2.1/verify?")) return Response.json({ client_id: "1234567890", scope: "profile", expires_in: 3600 });
    if (path.endsWith("/v2/profile")) return Response.json({ userId: subject });
    if (path.endsWith("/friendship/v1/status")) return Response.json({ friendFlag: true });
    if (path.includes("/richmenu/alias/")) return Response.json({ richMenuAliasId: "synthetic-alias", richMenuId: "synthetic-menu" });
    if (path.includes("/richmenu")) return Response.json({ richMenuId: "synthetic-menu" });
    throw new Error("Unexpected provider path");
  });
}
function dependencies(userId: string, fetcher = provider()) {
  return { database: first, now: () => now, fetcher, currentSession: async () => ({ userId, sessionHash: "synthetic-session" }) };
}
beforeAll(async () => {
  const url = process.env.DEMI_TEST_DATABASE_URL;
  if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Local disposable PostgreSQL required");
  await first.$connect(); await second.$connect();
});
beforeEach(() => {
  vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890"); vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
  vi.stubEnv("IDENTITY_HASH_SECRET", "synthetic-status-identity-secret-at-least-32");
  vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_SECRET", "synthetic-secret"); vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "synthetic-access");
  vi.stubEnv("DEMI_LINE_MESSAGING_BOT_USER_ID", "U" + "b".repeat(32));
});
afterEach(async () => {
  await first.lineWorkflowRateLimitBucket.deleteMany({ where: { category: { in: ["ACCOUNT_STATUS_USER", "ACCOUNT_STATUS_GLOBAL"] } } });
  await first.lineAccountBinding.deleteMany({ where: { userId: { in: users } } });
  await first.hospitalMembership.deleteMany({ where: { userId: { in: users } } });
  await first.userRole.deleteMany({ where: { userId: { in: users } } });
  await first.user.deleteMany({ where: { id: { in: users } } });
  await first.person.deleteMany({ where: { id: { in: people } } });
  await first.hospital.deleteMany({ where: { id: { in: hospitals } } });
  users.length = 0; people.length = 0; hospitals.length = 0; vi.unstubAllEnvs();
});
afterAll(async () => { await first.$disconnect(); await second.$disconnect(); });

describe("shared status quota and bounded reconciliation on PostgreSQL", () => {
  it("atomically admits six requests across independent pools and keeps users/workflow quotas independent", async () => {
    const principal = randomUUID();
    const a = createLineWorkflowRateLimiter(first); const b = createLineWorkflowRateLimiter(second);
    const results = await Promise.all(Array.from({ length: 30 }, (_unused, index) => (index % 2 ? a : b).consume("ACCOUNT_STATUS_USER", principal, now)));
    expect(results.filter(Boolean)).toHaveLength(6);
    const keyHash = lineWorkflowRateLimitInternals.hashRateLimitKey("ACCOUNT_STATUS_USER", principal);
    const rows = await first.lineWorkflowRateLimitBucket.findMany({ where: { category: "ACCOUNT_STATUS_USER", keyHash } });
    expect(rows).toHaveLength(1); expect(rows[0].hitCount).toBe(7); expect(rows[0].keyHash).not.toContain(principal);
    expect(await b.consume("ACCOUNT_STATUS_USER", randomUUID(), now)).toBe(true);
    expect(await b.consume("VERIFY_USER", principal, now)).toBe(true);
    await first.lineWorkflowRateLimitBucket.deleteMany({ where: { keyHash: lineWorkflowRateLimitInternals.hashRateLimitKey("VERIFY_USER", principal) } });
  });
  it("enforces the shared global ceiling atomically and rejects before any provider request", async () => {
    const target = await fixture();
    const keyHash = lineWorkflowRateLimitInternals.hashRateLimitKey("ACCOUNT_STATUS_GLOBAL", "GLOBAL");
    const window = lineWorkflowRateLimitInternals.rateLimitWindow(now);
    await first.lineWorkflowRateLimitBucket.create({ data: { category: "ACCOUNT_STATUS_GLOBAL", keyHash, windowStart: window.startsAt, expiresAt: window.expiresAt, hitCount: 599 } });
    const a = createLineWorkflowRateLimiter(first); const b = createLineWorkflowRateLimiter(second);
    const results = await Promise.all(Array.from({ length: 12 }, (_unused, index) => (index % 2 ? a : b).consume("ACCOUNT_STATUS_GLOBAL", "GLOBAL", now)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const fetcher = provider();
    await expect(checkOwnLineAccountStatus(tokens, dependencies(target.userId, fetcher))).rejects.toBeInstanceOf(LineAccountStatusRateLimited);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns checked only after verified read-back and enforces six sequential checks before provider work", async () => {
    const target = await fixture(); const fetcher = provider(); const options = dependencies(target.userId, fetcher);
    for (let attempt = 0; attempt < 6; attempt++) {
      expect(await checkOwnLineAccountStatus(tokens, options)).toMatchObject({ status: "LINKED", menuState: "APPLIED", reconciliation: "CHECKED" });
    }
    const count = fetcher.mock.calls.length;
    await expect(checkOwnLineAccountStatus(tokens, options)).rejects.toBeInstanceOf(LineAccountStatusRateLimited);
    expect(fetcher).toHaveBeenCalledTimes(count);
    expect(await first.lineAccountBinding.count({ where: { userId: target.userId } })).toBe(1);
  });
  it("rejects a different LINE identity before friendship or Messaging API calls", async () => {
    const target = await fixture();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ iss: "https://access.line.me", sub: "U" + "f".repeat(32), aud: "1234567890", exp: Math.floor(Date.now() / 1000) + 3600 }));
    await expect(checkOwnLineAccountStatus(tokens, dependencies(target.userId, fetcher))).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
    const binding = await first.lineAccountBinding.findUniqueOrThrow({ where: { id: target.bindingId } });
    expect(binding.lineUserId).toBe(subject); expect(binding.unlinkedAt).toBeNull(); expect(binding.menuSyncState).toBe("UNKNOWN");
  });
  it("reports a pre-existing lease as pending even with a prior APPLIED value, without Messaging API work", async () => {
    const target = await fixture(); const fetcher = provider();
    await first.lineAccountBinding.update({ where: { id: target.bindingId }, data: { reachability: "FRIEND", menuSyncState: "APPLIED", reconcileLeaseToken: randomUUID(), reconcileLeaseExpiresAt: new Date(Date.now() + 90_000) } });
    expect(await checkOwnLineAccountStatus(tokens, dependencies(target.userId, fetcher))).toMatchObject({ reconciliation: "PENDING" });
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/v2/bot/"))).toHaveLength(0);
  });
  it("handles simultaneous tab checks on separate pools without concurrent Messaging work", async () => {
    const target = await fixture(); const base = provider(); let release: (() => void) | undefined;
    let held = false;
    const firstFetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (!held && String(url).includes("/v2/bot/user/")) {
        held = true;
        await new Promise<void>((resolve) => { release = resolve; });
      }
      return base(url, init);
    });
    const running = checkOwnLineAccountStatus(tokens, dependencies(target.userId, firstFetcher));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const secondFetcher = provider();
    try {
      const other = await checkOwnLineAccountStatus(tokens, { ...dependencies(target.userId, secondFetcher), database: second });
      expect(other.reconciliation).toBe("PENDING");
      expect(secondFetcher.mock.calls.filter(([url]) => String(url).includes("/v2/bot/"))).toHaveLength(0);
    } finally { release?.(); }
    expect(await running).toMatchObject({ reconciliation: "CHECKED", menuState: "APPLIED" });
    expect(await first.lineAccountBinding.count({ where: { userId: target.userId } })).toBe(1);
  });
  it("bounds sequential slow verification calls with one deadline and permits a later explicit retry", async () => {
    const target = await fixture(); const base = provider();
    const slow = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 35);
        init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
      });
      return base(url, init);
    });
    await expect(checkOwnLineAccountStatus(tokens, { ...dependencies(target.userId, slow), signal: AbortSignal.timeout(80) })).rejects.toThrow();
    expect(slow.mock.calls.length).toBeLessThan(4);
    expect(slow.mock.calls.every(([url]) => !String(url).includes("/v2/bot/"))).toBe(true);
    expect(await checkOwnLineAccountStatus(tokens, dependencies(target.userId))).toMatchObject({ reconciliation: "CHECKED", status: "LINKED" });
  });
  it("awaits an aborted menu write, persists uncertainty and releases the lease without APPLIED or unlink", async () => {
    const target = await fixture(); const controller = new AbortController(); const base = provider();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).includes("/v2/bot/user/") && init?.method === "POST") {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      }
      // Force a menu mutation followed by read-back (which must never claim success after abort).
      if (String(url).includes("/v2/bot/user/")) return new Response(null, { status: 404 });
      return base(url, init);
    });
    await expect(checkOwnLineAccountStatus(tokens, { ...dependencies(target.userId, fetcher), signal: controller.signal })).rejects.toThrow();
    const binding = await first.lineAccountBinding.findUniqueOrThrow({ where: { id: target.bindingId } });
    expect(binding.menuSyncState).toBe("UNAVAILABLE"); expect(binding.menuSyncedAt).toBeNull();
    expect(binding.reconcileLeaseToken).toBeNull(); expect(binding.unlinkedAt).toBeNull(); expect(binding.lifecycleVersion).toBe(1);
  });
  it("fences a lifecycle change/unlink during provider work and never writes APPLIED to the newer version", async () => {
    const target = await fixture(); const base = provider(); let changed = false;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (!changed && String(url).includes("/v2/bot/user/")) {
        changed = true;
        await second.lineAccountBinding.update({ where: { id: target.bindingId }, data: { unlinkedAt: new Date(), lifecycleVersion: { increment: 1 }, menuSyncState: "UNKNOWN", providerCleanupState: "PENDING" } });
      }
      return base(url, init);
    });
    const result = await checkOwnLineAccountStatus(tokens, dependencies(target.userId, fetcher));
    expect(result.status).toBe("UNLINKED");
    const binding = await first.lineAccountBinding.findUniqueOrThrow({ where: { id: target.bindingId } });
    expect(binding.lifecycleVersion).toBe(2); expect(binding.unlinkedAt).not.toBeNull(); expect(binding.menuSyncState).not.toBe("APPLIED");
  });
});
