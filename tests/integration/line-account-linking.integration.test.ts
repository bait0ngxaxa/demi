import { createHash, randomUUID } from "node:crypto";

import {
  LineAccountAction,
  LineAccountActionOutcome,
  HospitalStatus,
  LineMenuSyncState,
  MembershipStatus,
  MembershipType,
  LineProviderCleanupState,
  LineReachability,
  LineWorkspaceRole,
  LineWebhookEventOutcome,
  LineWebhookEventType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { LineFailure } from "@/modules/line/domain/line-errors";
import { applyLineReachabilityObservation, isLinePushReachabilityEligible } from "@/modules/line/services/line-reachability-service";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { createLineAccountIntent, getLineAccountSummary, refreshLineAccountReachability, linkLineAccount, unlinkLineAccount } from "@/modules/line/services/line-account-service";
import { LINE_RICH_MENU_BY_KEY } from "@/modules/line/rich-menu/catalog";
import { lineMenuReconcilerInternals, reconcileLineBinding, type LinePresentationProvider } from "@/modules/line/services/line-menu-reconciler";

const database = getPrisma();
let connected = false;
const userIds: string[] = [];
const personIds: string[] = [];
const hospitalIds: string[] = [];
const receiptIds: string[] = [];
const sessionHash = "a".repeat(64);

function requireDisposableDatabase(): void {
  const url = process.env.DEMI_TEST_DATABASE_URL;
  if (
    !url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url ||
    process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)
  ) {
    throw new Error("Verified local disposable PostgreSQL is required for LINE integration tests");
  }
}

async function createUser(): Promise<string> {
  const marker = randomUUID();
  const person = await database.person.create({
    data: {
      identityKeyHash: createHash("sha256").update(`line-test:${marker}`).digest("hex"),
      givenName: "ทดสอบ",
      familyName: "LINE",
    },
    select: { id: true },
  });
  const user = await database.user.create({
    data: { personId: person.id, authSubject: marker, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  personIds.push(person.id);
  userIds.push(user.id);
  return user.id;
}

async function createOsmHospitalUser(): Promise<string> {
  const userId = await createUser();
  const hospital = await database.hospital.create({
    data: {
      hospitalCode: `LINE-${randomUUID().slice(0, 8)}`,
      name: "โรงพยาบาลทดสอบ LINE",
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
  hospitalIds.push(hospital.id);
  await Promise.all([
    database.userRole.create({ data: { userId, role: Role.OSM } }),
    database.userRole.create({ data: { userId, role: Role.HOSPITAL } }),
    database.osmHospitalRelationship.create({ data: { userId, hospitalId: hospital.id, status: MembershipStatus.ACTIVE } }),
    database.hospitalMembership.create({ data: { userId, hospitalId: hospital.id, membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE } }),
  ]);
  return userId;
}

function subject(seed: string = randomUUID()): string {
  return `U${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

function fingerprint(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

async function createBinding(
  userId: string,
  input: {
    lineUserId?: string | null;
    fingerprint?: string;
    unlinkedAt?: Date | null;
    cleanupState?: LineProviderCleanupState | null;
    lifecycleVersion?: number;
  } = {},
) {
  const lineUserId = input.lineUserId === undefined ? subject() : input.lineUserId;
  const unlinkedAt = input.unlinkedAt ?? null;
  return database.lineAccountBinding.create({
    data: {
      userId,
      lineUserId,
      lineSubjectFingerprint: input.fingerprint ?? fingerprint(lineUserId ?? randomUUID()),
      lineSubjectFingerprintKeyId: fingerprint("test-key-v1"),
      unlinkedAt,
      lifecycleVersion: input.lifecycleVersion ?? 1,
      reachability: LineReachability.UNKNOWN,
      menuSyncState: LineMenuSyncState.UNKNOWN,
      providerCleanupState: input.cleanupState ?? (unlinkedAt ? LineProviderCleanupState.PENDING : null),
    },
  });
}

async function createIntent(userId: string) {
  return database.lineAccountActionIntent.create({
    data: {
      userId,
      action: LineAccountAction.LINK,
      challengeHash: fingerprint(`challenge:${randomUUID()}`),
      sessionHash: fingerprint(`session:${randomUUID()}`),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

function lineAccountDependencies(userId: string, now = new Date()) {
  return {
    database,
    now: () => now,
    currentSession: async () => ({ userId, sessionHash }),
    verifyIdentity: async () => ({ subject: subject("trusted-line-subject") }),
  };
}

async function clearFixtures(): Promise<void> {
  if (receiptIds.length) {
    await database.lineWebhookEventReceipt.deleteMany({ where: { webhookEventId: { in: [...receiptIds] } } });
    receiptIds.splice(0);
  }
  if (userIds.length) {
    await database.auditEvent.deleteMany({ where: { actorUserId: { in: [...userIds] }, resourceType: "LineAccountBinding" } });
    await database.lineAccountActionIntent.deleteMany({ where: { userId: { in: [...userIds] } } });
    await database.lineAccountBinding.deleteMany({ where: { userId: { in: [...userIds] } } });
    await database.userRole.deleteMany({ where: { userId: { in: [...userIds] } } });
    await database.user.deleteMany({ where: { id: { in: [...userIds] } } });
    userIds.splice(0);
  }
  if (hospitalIds.length) {
    await database.hospital.deleteMany({ where: { id: { in: [...hospitalIds] } } });
    hospitalIds.splice(0);
  }
  if (personIds.length) {
    await database.person.deleteMany({ where: { id: { in: [...personIds] } } });
    personIds.splice(0);
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

async function waitForPostgresLockWait(): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const activity = await database.$queryRaw<Array<{ wait_event_type: string | null }>>(Prisma.sql`
      SELECT "wait_event_type" FROM pg_stat_activity
      WHERE "datname" = current_database() AND "pid" <> pg_backend_pid()
    `);
    if (activity.some(({ wait_event_type }) => wait_event_type === "Lock")) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("PostgreSQL did not expose the expected row-lock waiter");
}

describe("Phase 17J.1 LINE PostgreSQL invariants", () => {
  beforeAll(async () => {
    requireDisposableDatabase();
    await database.$connect();
    connected = true;
  });

  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });

  afterEach(async () => {
    if (connected) await clearFixtures();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    if (connected) {
      await clearFixtures();
      await database.$disconnect();
      connected = false;
    }
  });

  it("enforces both active-only unique indexes and allows retained historical fingerprints", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();
    const sharedFingerprint = fingerprint("shared-subject");
    const active = await createBinding(firstUser, { fingerprint: sharedFingerprint });

    await expect(createBinding(secondUser, { fingerprint: sharedFingerprint })).rejects.toMatchObject({ code: "P2002" });
    await expect(createBinding(firstUser, { fingerprint: fingerprint("different-subject") })).rejects.toMatchObject({ code: "P2002" });

    await database.lineAccountBinding.update({
      where: { id: active.id },
      data: { unlinkedAt: new Date(), providerCleanupState: LineProviderCleanupState.UNKNOWN },
    });
    await expect(createBinding(firstUser, { fingerprint: fingerprint("new-active-subject") })).resolves.toBeTruthy();

    const historyFingerprint = fingerprint("retained-history-is-not-a-db-unique-index");
    const retired = new Date();
    await createBinding(firstUser, { fingerprint: historyFingerprint, unlinkedAt: retired, cleanupState: LineProviderCleanupState.CONFIRMED_CLEAN, lineUserId: null });
    await expect(createBinding(secondUser, { fingerprint: historyFingerprint, unlinkedAt: retired, cleanupState: LineProviderCleanupState.CONFIRMED_CLEAN, lineUserId: null })).resolves.toBeTruthy();

    const indexes = await database.$queryRaw<Array<{ indexname: string; indexdef: string }>>(Prisma.sql`
      SELECT "indexname", "indexdef" FROM pg_indexes
      WHERE "schemaname" = current_schema() AND "tablename" = 'LineAccountBinding'
    `);
    const subjectIndex = indexes.find(({ indexname }) => indexname === "LineAccountBinding_active_subject_fingerprint_key");
    const userIndex = indexes.find(({ indexname }) => indexname === "LineAccountBinding_active_user_key");
    expect(subjectIndex?.indexdef).toMatch(/UNIQUE.*\("lineSubjectFingerprint"\).*WHERE \("unlinkedAt" IS NULL\)/u);
    expect(userIndex?.indexdef).toMatch(/UNIQUE.*\("userId"\).*WHERE \("unlinkedAt" IS NULL\)/u);
  });

  it.each([LineReachability.UNKNOWN, LineReachability.NOT_FRIEND])("recovers active %s reachability from fresh verified friendship", async (reachability) => {
    const userId = await createUser();
    const binding = await createBinding(userId);
    await database.lineAccountBinding.update({ where: { id: binding.id }, data: { reachability } });
    const verifyIdentity = vi.fn(async () => ({ subject: binding.lineUserId ?? "" }));
    const verifyFriendship = vi.fn(async () => ({ friend: true }));
    await refreshLineAccountReachability({ idToken: "fresh-id", accessToken: "fresh-access" }, {
      database, currentSession: async () => ({ userId, sessionHash }), verifyIdentity, verifyFriendship,
    });
    expect(verifyIdentity).toHaveBeenCalledWith("fresh-id");
    expect(verifyFriendship).toHaveBeenCalledWith("fresh-access", binding.lineUserId);
    const refreshed = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(refreshed.reachability).toBe(LineReachability.FRIEND);
    expect(refreshed.lifecycleVersion).toBe(binding.lifecycleVersion);
    expect(refreshed.presentationRole).toBeNull();
  });

  it("keeps binding UNKNOWN on transient initial friendship failure, then recovers on account entry", async () => {
    const userId = await createUser();
    const dependencies = lineAccountDependencies(userId, new Date());
    const intent = await createLineAccountIntent(LineAccountAction.LINK, dependencies);
    const linked = await linkLineAccount({ ...intent, idToken: "id-token", accessToken: "access-token" }, {
      ...dependencies, verifyFriendship: async () => { throw new LineFailure("FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE"); },
    });
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } })).reachability).toBe(LineReachability.UNKNOWN);
    await refreshLineAccountReachability({ idToken: "new-id", accessToken: "new-access" }, { ...dependencies, verifyFriendship: async () => ({ friend: true }) });
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } })).reachability).toBe(LineReachability.FRIEND);
  });

  it("denies mismatched identity and missing session; provider failure preserves state", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId);
    const verifyFriendship = vi.fn(async () => ({ friend: true }));
    const dependencies = { database, currentSession: async () => ({ userId, sessionHash }), verifyIdentity: async () => ({ subject: subject("wrong") }), verifyFriendship };
    const input = { idToken: "fresh-id", accessToken: "fresh-access" };
    await expect(refreshLineAccountReachability(input, dependencies)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verifyFriendship).not.toHaveBeenCalled();
    await expect(refreshLineAccountReachability(input, { ...dependencies, currentSession: async () => { throw new Error("no session"); } })).rejects.toThrow();
    await expect(refreshLineAccountReachability(input, {
      ...dependencies, verifyIdentity: async () => ({ subject: binding.lineUserId ?? "" }),
      verifyFriendship: async () => { throw new LineFailure("FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE"); },
    })).rejects.toBeInstanceOf(LineFailure);
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).reachability).toBe(LineReachability.UNKNOWN);
  });

  it("rejects stale lifecycle and orders late friendship checks behind newer signed observations", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId);
    const started = new Date();
    const dependencies = {
      database, currentSession: async () => ({ userId, sessionHash }), now: () => started,
      verifyIdentity: async () => ({ subject: binding.lineUserId ?? "" }),
      verifyFriendship: async () => {
        await runSerializableTransaction(database, (tx) => applyLineReachabilityObservation(tx, binding.lineUserId ?? "", LineReachability.NOT_FRIEND, new Date(started.getTime() + 1000)));
        return { friend: true };
      },
    };
    const input = { idToken: "fresh-id", accessToken: "fresh-access" };
    await refreshLineAccountReachability(input, dependencies);
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).reachability).toBe(LineReachability.NOT_FRIEND);
    await refreshLineAccountReachability(input, { ...dependencies, now: () => new Date(started.getTime() + 1000), verifyFriendship: async () => ({ friend: true }) });
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).reachability).toBe(LineReachability.UNKNOWN);
    await expect(refreshLineAccountReachability(input, { ...dependencies, verifyFriendship: async () => {
      await database.lineAccountBinding.update({ where: { id: binding.id }, data: { lifecycleVersion: { increment: 1 } } });
      return { friend: true };
    } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).reachability).toBe(LineReachability.UNKNOWN);
  });

  it("exposes safe unresolved cleanup and recovers it without reactivating identity", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId, { unlinkedAt: new Date(), cleanupState: LineProviderCleanupState.UNAVAILABLE });
    await database.lineAccountBinding.update({ where: { id: binding.id }, data: { providerCleanupLastAttemptAt: new Date(), providerCleanupAttemptCount: 2 } });
    const dependencies = { database, currentSession: async () => ({ userId, sessionHash }), verifyIdentity: async () => ({ subject: binding.lineUserId ?? "" }), verifyFriendship: async () => ({ friend: true }) };
    expect(await getLineAccountSummary(dependencies)).toEqual({ status: "UNLINKED", canUnlink: false, reachability: "UNKNOWN", menuState: null, cleanupState: "UNAVAILABLE" });
    await refreshLineAccountReachability({ idToken: "fresh-id", accessToken: "fresh-access" }, dependencies);
    const recovered = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(recovered.unlinkedAt).toEqual(binding.unlinkedAt);
    expect(recovered.lifecycleVersion).toBe(binding.lifecycleVersion);
    expect(recovered.providerCleanupLastAttemptAt).toBeNull();
    expect(recovered.reachability).toBe(LineReachability.FRIEND);
    expect(recovered.lineUserId).toBe(binding.lineUserId);
    const provider: LinePresentationProvider = { getAlias: async () => null, listAliases: async () => [], linkUserMenu: vi.fn(), unlinkUserMenu: vi.fn(async () => undefined), getUserMenu: async () => null };
    await reconcileLineBinding(binding.id, { database, provider });
    const cleaned = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(cleaned.providerCleanupState).toBe(LineProviderCleanupState.CONFIRMED_CLEAN);
    expect(cleaned.lineUserId).toBeNull();
    expect(cleaned.unlinkedAt).toEqual(binding.unlinkedAt);
    expect(cleaned.lineSubjectFingerprint).toBe(binding.lineSubjectFingerprint);
    expect(provider.linkUserMenu).not.toHaveBeenCalled();
  });

  it.each([
    [LineReachability.NOT_FRIEND, LineProviderCleanupState.UNAVAILABLE],
    [LineReachability.UNKNOWN, LineProviderCleanupState.UNKNOWN],
  ])("maps %s cleanup to %s without DELETE", async (reachability, outcome) => {
    const userId = await createUser();
    const binding = await createBinding(userId, { unlinkedAt: new Date() });
    await database.lineAccountBinding.update({ where: { id: binding.id }, data: { reachability } });
    const provider: LinePresentationProvider = { getAlias: vi.fn(), listAliases: vi.fn(), linkUserMenu: vi.fn(), unlinkUserMenu: vi.fn(), getUserMenu: vi.fn() };
    await reconcileLineBinding(binding.id, { database, provider });
    expect(provider.unlinkUserMenu).not.toHaveBeenCalled();
    expect(provider.getUserMenu).not.toHaveBeenCalled();
    const result = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(result.providerCleanupState).toBe(outcome);
    expect(result.lineUserId).toBe(binding.lineUserId);
  });

  it("does not label a permanent provider error without readback as mismatch", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId, { unlinkedAt: new Date() });
    await database.lineAccountBinding.update({ where: { id: binding.id }, data: { reachability: LineReachability.FRIEND, reachabilityObservedAt: new Date() } });
    const provider: LinePresentationProvider = { getAlias: vi.fn(), listAliases: vi.fn(), linkUserMenu: vi.fn(), getUserMenu: vi.fn(), unlinkUserMenu: async () => { throw new LineFailure("LINE_PROVIDER_PERMANENT"); } };
    await reconcileLineBinding(binding.id, { database, provider });
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } })).providerCleanupState).toBe(LineProviderCleanupState.UNAVAILABLE);
    expect(provider.getUserMenu).not.toHaveBeenCalled();
  });

  it("links the verified subject to the authenticated DEMI User, handles idempotence, then unlinks locally first", async () => {
    const userId = await createUser();
    const now = new Date();
    const dependencies = lineAccountDependencies(userId, now);
    const linkIntent = await createLineAccountIntent(LineAccountAction.LINK, dependencies);
    const friendshipDependencies = {
      ...dependencies,
      verifyFriendship: async () => ({ friend: false }),
    };
    const linked = await linkLineAccount({ ...linkIntent, idToken: "opaque-token-not-persisted", accessToken: "transient-token-not-persisted" }, friendshipDependencies);
    expect(linked).toMatchObject({ status: "LINKED", lifecycleVersion: 1 });
    const binding = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } });
    expect(binding.userId).toBe(userId);
    expect(binding.lineUserId).toBe(subject("trusted-line-subject"));
    expect(binding.reachability).toBe(LineReachability.NOT_FRIEND);
    expect(binding.lineSubjectFingerprint).not.toBe(binding.lineUserId);

    const repeatedIntent = await createLineAccountIntent(LineAccountAction.LINK, dependencies);
    await expect(linkLineAccount({ ...repeatedIntent, idToken: "opaque-token-not-persisted" }, dependencies)).resolves.toEqual({
      status: "ALREADY_LINKED",
      bindingId: linked.bindingId,
      lifecycleVersion: 1,
    });

    let delayedClock = now;
    const delayedFriendshipDependencies = {
      ...dependencies,
      now: () => delayedClock,
      verifyFriendship: async () => {
        const newerUnfollow = new Date(now.getTime() + 1000);
        await runSerializableTransaction(database, (transaction) => applyLineReachabilityObservation(
          transaction,
          subject("trusted-line-subject"),
          LineReachability.NOT_FRIEND,
          newerUnfollow,
        ));
        delayedClock = new Date(now.getTime() + 2000);
        return { friend: true };
      },
    };
    const delayedIntent = await createLineAccountIntent(LineAccountAction.LINK, delayedFriendshipDependencies);
    await linkLineAccount({ ...delayedIntent, idToken: "opaque-token-not-persisted", accessToken: "delayed-token-not-persisted" }, delayedFriendshipDependencies);
    const afterDelayedCheck = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } });
    expect(afterDelayedCheck.reachability).toBe(LineReachability.NOT_FRIEND);
    expect(afterDelayedCheck.reachabilityObservedAt).toEqual(new Date(now.getTime() + 1000));

    expect(await database.lineAccountBinding.count({ where: { userId, unlinkedAt: null } })).toBe(1);

    const unlinkIntent = await createLineAccountIntent(LineAccountAction.UNLINK, dependencies);
    const unlinked = await unlinkLineAccount(unlinkIntent, dependencies);
    expect(unlinked).toMatchObject({ status: "UNLINKED", lifecycleVersion: 2, bindingId: linked.bindingId });
    const authoritative = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: linked.bindingId } });
    expect(authoritative.unlinkedAt).not.toBeNull();
    expect(authoritative.providerCleanupState).toBe(LineProviderCleanupState.PENDING);
    expect(authoritative.lineUserId).toBe(binding.lineUserId);
    expect(authoritative.presentationRole).toBeNull();
    expect(authoritative.lifecycleVersion).toBe(2);
    expect(await database.lineAccountBinding.count({ where: { userId, unlinkedAt: null } })).toBe(0);
  });

  it("rejects cross-user retained-history takeover but permits explicit same-user relink", async () => {
    const ownerId = await createUser();
    const otherUserId = await createUser();
    const ownerDependencies = lineAccountDependencies(ownerId);
    const initialIntent = await createLineAccountIntent(LineAccountAction.LINK, ownerDependencies);
    const initial = await linkLineAccount({ ...initialIntent, idToken: "opaque-token-not-persisted" }, ownerDependencies);
    const unlinkIntent = await createLineAccountIntent(LineAccountAction.UNLINK, ownerDependencies);
    await unlinkLineAccount(unlinkIntent, ownerDependencies);

    const otherDependencies = lineAccountDependencies(otherUserId);
    const takeoverIntent = await createLineAccountIntent(LineAccountAction.LINK, otherDependencies);
    await expect(linkLineAccount({ ...takeoverIntent, idToken: "opaque-token-not-persisted" }, otherDependencies))
      .rejects.toMatchObject({ code: "LINE_BINDING_CONFLICT" });
    expect(await database.lineAccountBinding.count({ where: { userId: otherUserId, unlinkedAt: null } })).toBe(0);

    const relinkIntent = await createLineAccountIntent(LineAccountAction.LINK, ownerDependencies);
    const relinked = await linkLineAccount({ ...relinkIntent, idToken: "opaque-token-not-persisted" }, ownerDependencies);
    expect(relinked).toMatchObject({ status: "LINKED", bindingId: initial.bindingId, lifecycleVersion: 3 });
    const binding = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: initial.bindingId } });
    expect(binding.unlinkedAt).toBeNull();
    expect(binding.providerCleanupState).toBeNull();
    expect(binding.presentationRole).toBeNull();
    expect(binding.reachability).toBe(LineReachability.UNKNOWN);
    expect(binding.lineUserId).toBe(subject("trusted-line-subject"));
  });

  it("uses PostgreSQL uniqueness as the concurrent identity and user race arbiter", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();
    const sameUser = await createUser();
    const sharedSubject = subject("same-line");
    const sharedHash = fingerprint("same-line");
    const sameLineRace = await Promise.allSettled([
      createBinding(firstUser, { lineUserId: sharedSubject, fingerprint: sharedHash }),
      createBinding(secondUser, { lineUserId: sharedSubject, fingerprint: sharedHash }),
    ]);
    expect(sameLineRace.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(sameLineRace.filter(({ status }) => status === "rejected")).toHaveLength(1);

    const sameUserRace = await Promise.allSettled([
      createBinding(sameUser, { lineUserId: subject("line-a"), fingerprint: fingerprint("line-a") }),
      createBinding(sameUser, { lineUserId: subject("line-b"), fingerprint: fingerprint("line-b") }),
    ]);
    expect(sameUserRace.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(sameUserRace.filter(({ status }) => status === "rejected")).toHaveLength(1);
  });

  it("serializes concurrent account-link service requests for one User and one LINE subject", async () => {
    const sameUserId = await createUser();
    const sameUserDependencies = lineAccountDependencies(sameUserId);
    const [firstIntent, secondIntent] = await Promise.all([
      createLineAccountIntent(LineAccountAction.LINK, sameUserDependencies),
      createLineAccountIntent(LineAccountAction.LINK, sameUserDependencies),
    ]);
    const sameUserLinks = await Promise.allSettled([
      linkLineAccount({ ...firstIntent, idToken: "subject-a" }, {
        ...sameUserDependencies,
        verifyIdentity: async () => ({ subject: subject("concurrent-subject-a") }),
      }),
      linkLineAccount({ ...secondIntent, idToken: "subject-b" }, {
        ...sameUserDependencies,
        verifyIdentity: async () => ({ subject: subject("concurrent-subject-b") }),
      }),
    ]);
    expect(sameUserLinks.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(sameUserLinks.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const sameUserRejection = sameUserLinks.find(({ status }) => status === "rejected");
    expect(sameUserRejection).toMatchObject({ reason: { code: "LINE_BINDING_CONFLICT" } });
    expect(await database.lineAccountBinding.count({ where: { userId: sameUserId, unlinkedAt: null } })).toBe(1);

    const [firstUserId, secondUserId] = await Promise.all([createUser(), createUser()]);
    const sharedSubject = subject("concurrent-shared-subject");
    const firstDependencies = lineAccountDependencies(firstUserId);
    const secondDependencies = lineAccountDependencies(secondUserId);
    const [firstLinkIntent, secondLinkIntent] = await Promise.all([
      createLineAccountIntent(LineAccountAction.LINK, firstDependencies),
      createLineAccountIntent(LineAccountAction.LINK, secondDependencies),
    ]);
    const sameLineLinks = await Promise.allSettled([
      linkLineAccount({ ...firstLinkIntent, idToken: "shared-subject" }, {
        ...firstDependencies,
        verifyIdentity: async () => ({ subject: sharedSubject }),
      }),
      linkLineAccount({ ...secondLinkIntent, idToken: "shared-subject" }, {
        ...secondDependencies,
        verifyIdentity: async () => ({ subject: sharedSubject }),
      }),
    ]);
    expect(sameLineLinks.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(sameLineLinks.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(sameLineLinks.find(({ status }) => status === "rejected")).toMatchObject({ reason: { code: "LINE_BINDING_CONFLICT" } });
    expect(await database.lineAccountBinding.count({ where: { lineUserId: sharedSubject, unlinkedAt: null } })).toBe(1);
  });

  it("consumes a session-bound action intent once and rolls intent/effect changes back together", async () => {
    const userId = await createUser();
    const intent = await createIntent(userId);
    const consume = () => database.$transaction(async (transaction) => transaction.lineAccountActionIntent.updateMany({
      where: { id: intent.id, consumedAt: null },
      data: { consumedAt: new Date(), outcome: LineAccountActionOutcome.SUCCEEDED },
    }));
    const concurrentConsumes = await Promise.all([consume(), consume()]);
    expect(concurrentConsumes.map(({ count }) => count).sort()).toEqual([0, 1]);
    expect(await database.lineAccountActionIntent.count({ where: { id: intent.id, consumedAt: { not: null } } })).toBe(1);

    const binding = await createBinding(userId);
    const eventId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    receiptIds.push(eventId);
    await expect(database.$transaction(async (transaction) => {
      await transaction.lineAccountBinding.update({ where: { id: binding.id }, data: { reachability: LineReachability.FRIEND } });
      await transaction.lineWebhookEventReceipt.create({
        data: {
          webhookEventId: eventId,
          eventType: LineWebhookEventType.FOLLOW,
          eventOccurredAt: new Date(),
          outcome: LineWebhookEventOutcome.APPLIED,
        },
      });
      throw new Error("force transaction rollback");
    })).rejects.toThrow("force transaction rollback");
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id }, select: { reachability: true } })).toEqual({ reachability: LineReachability.UNKNOWN });
    expect(await database.lineWebhookEventReceipt.count({ where: { webhookEventId: eventId } })).toBe(0);

    await database.lineWebhookEventReceipt.create({
      data: {
        webhookEventId: eventId,
        eventType: LineWebhookEventType.FOLLOW,
        eventOccurredAt: new Date(),
        outcome: LineWebhookEventOutcome.APPLIED,
      },
    });
    await expect(database.lineWebhookEventReceipt.create({
      data: {
        webhookEventId: eventId,
        eventType: LineWebhookEventType.FOLLOW,
        eventOccurredAt: new Date(),
        outcome: LineWebhookEventOutcome.APPLIED,
      },
    })).rejects.toMatchObject({ code: "P2002" });
  });

  it("serializes concurrent lifecycle changes with real PostgreSQL row locks", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId);
    const locked = deferred();
    const release = deferred();
    const holder = database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${binding.id}::uuid FOR UPDATE`;
      locked.resolve();
      await release.promise;
      await transaction.lineAccountBinding.update({ where: { id: binding.id }, data: { presentationRole: LineWorkspaceRole.PATIENT } });
    }, { timeout: 10_000 });
    await locked.promise;

    const attempted = deferred();
    const contender = database.$transaction(async (transaction) => {
      attempted.resolve();
      await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${binding.id}::uuid FOR UPDATE`;
      const current = await transaction.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id }, select: { presentationRole: true } });
      await transaction.lineAccountBinding.update({ where: { id: binding.id }, data: { presentationRole: current.presentationRole === LineWorkspaceRole.PATIENT ? LineWorkspaceRole.OSM : LineWorkspaceRole.HOSPITAL } });
    }, { timeout: 10_000 });
    await attempted.promise;
    let lockError: unknown;
    try {
      await waitForPostgresLockWait();
    } catch (error: unknown) {
      lockError = error;
    } finally {
      release.resolve();
    }
    await Promise.all([holder, contender]);
    if (lockError) throw lockError;
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id }, select: { presentationRole: true } })).toEqual({ presentationRole: LineWorkspaceRole.OSM });
  });

  it("fences cleanup status by lifecycle version and recovers expired lease ownership", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId, { unlinkedAt: new Date(), cleanupState: LineProviderCleanupState.PENDING });
    const now = new Date("2026-10-06T00:00:00.000Z");
    const first = await lineMenuReconcilerInternals.acquireLease(binding.id, { database, now: () => now });
    expect(first).not.toBeNull();
    if (!first) throw new Error("Expected PostgreSQL reconciliation lease");
    expect(await lineMenuReconcilerInternals.acquireLease(binding.id, { database, now: () => now })).toBeNull();

    await database.lineAccountBinding.update({
      where: { id: binding.id },
      data: { lifecycleVersion: { increment: 1 }, unlinkedAt: null, providerCleanupState: null, reachability: LineReachability.UNKNOWN },
    });
    await lineMenuReconcilerInternals.persistCleanupOutcome(first.binding, first.token, LineProviderCleanupState.CONFIRMED_CLEAN, database, true);
    const current = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(current.lifecycleVersion).toBe(2);
    expect(current.lineUserId).toBe(binding.lineUserId);
    expect(current.providerCleanupState).toBeNull();

    await lineMenuReconcilerInternals.releaseLease(binding.id, first.token, database);
    const second = await lineMenuReconcilerInternals.acquireLease(binding.id, { database, now: () => now });
    expect(second?.token).not.toBe(first.token);
    if (!second) throw new Error("Expected a replacement lease");
    await database.lineAccountBinding.update({
      where: { id: binding.id },
      data: { reconcileLeaseExpiresAt: new Date(now.getTime() - 1) },
    });
    const recovered = await lineMenuReconcilerInternals.acquireLease(binding.id, { database, now: () => now });
    expect(recovered?.token).not.toBe(second.token);
    if (!recovered) throw new Error("Expected an expired lease to be recoverable");
    await lineMenuReconcilerInternals.releaseLease(binding.id, second.token, database);
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id }, select: { reconcileLeaseToken: true } })).toEqual({ reconcileLeaseToken: recovered.token });
    await lineMenuReconcilerInternals.releaseLease(binding.id, recovered.token, database);
  });

  it("clears the temporary provider locator only after a clean menu read-back", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId, { unlinkedAt: new Date(), cleanupState: LineProviderCleanupState.PENDING });
    const observedAt = new Date();
    await database.lineAccountBinding.update({ where: { id: binding.id }, data: { reachability: LineReachability.FRIEND, reachabilityObservedAt: observedAt } });
    const provider: LinePresentationProvider = {
      getAlias: async () => null,
      listAliases: async () => [],
      linkUserMenu: async () => undefined,
      getUserMenu: async () => null,
      unlinkUserMenu: async () => undefined,
    };

    await expect(reconcileLineBinding(binding.id, { database, provider })).resolves.toBe("RECONCILED");
    const result = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(result.unlinkedAt).not.toBeNull();
    expect(result.providerCleanupState).toBe(LineProviderCleanupState.CONFIRMED_CLEAN);
    expect(result.lineUserId).toBeNull();
    expect(result.lineSubjectFingerprint).toBe(binding.lineSubjectFingerprint);
    expect(result.providerCleanupAttemptCount).toBe(1);
    expect(result.providerCleanupLastAttemptAt).not.toBeNull();
  });

  it("records APPLIED, MISMATCH, UNAVAILABLE and UNKNOWN as presentation-only states", async () => {
    const appliedUser = await createUser();
    const mismatchUser = await createUser();
    const unavailableUser = await createUser();
    const aliasUnavailableUser = await createUser();
    const unknownUser = await createUser();
    const appliedBinding = await createBinding(appliedUser);
    const mismatchBinding = await createBinding(mismatchUser);
    const unavailableBinding = await createBinding(unavailableUser);
    const aliasUnavailableBinding = await createBinding(aliasUnavailableUser);
    const unknownBinding = await createBinding(unknownUser);
    const observedAt = new Date();
    await database.lineAccountBinding.updateMany({
      where: { id: { in: [appliedBinding.id, mismatchBinding.id, unavailableBinding.id, aliasUnavailableBinding.id] } },
      data: { reachability: LineReachability.FRIEND, reachabilityObservedAt: observedAt },
    });
    const ineligibleMenu = LINE_RICH_MENU_BY_KEY.get("LINKED_INELIGIBLE");
    if (!ineligibleMenu) throw new Error("Expected the linked-ineligible menu");
    let menu: string | null = null;
    const appliedProvider: LinePresentationProvider = {
      getAlias: async (alias) => alias === ineligibleMenu.alias ? "correct-menu" : null,
      listAliases: async () => [],
      getUserMenu: async () => menu,
      linkUserMenu: async (_lineUserId, richMenuId) => { menu = richMenuId; },
      unlinkUserMenu: async () => undefined,
    };
    const mismatchProvider: LinePresentationProvider = {
      ...appliedProvider,
      getUserMenu: async () => "stale-menu",
      linkUserMenu: async () => undefined,
    };
    const unavailableProvider: LinePresentationProvider = {
      ...appliedProvider,
      getUserMenu: async () => { throw new LineFailure("LINE_PROVIDER_TRANSIENT"); },
    };
    const aliasUnavailableProvider: LinePresentationProvider = {
      ...appliedProvider,
      getAlias: async () => { throw new LineFailure("LINE_PROVIDER_TRANSIENT"); },
    };
    const untouchedProvider: LinePresentationProvider = {
      ...appliedProvider,
      getUserMenu: async () => { throw new Error("provider must not be called for UNKNOWN reachability"); },
    };

    await reconcileLineBinding(appliedBinding.id, { database, provider: appliedProvider });
    await reconcileLineBinding(mismatchBinding.id, { database, provider: mismatchProvider });
    await reconcileLineBinding(unavailableBinding.id, { database, provider: unavailableProvider });
    await reconcileLineBinding(aliasUnavailableBinding.id, { database, provider: aliasUnavailableProvider });
    await reconcileLineBinding(unknownBinding.id, { database, provider: untouchedProvider });
    const states = await Promise.all([appliedBinding, mismatchBinding, unavailableBinding, aliasUnavailableBinding, unknownBinding].map(({ id }) =>
      database.lineAccountBinding.findUniqueOrThrow({ where: { id }, select: { menuSyncState: true, menuExpectedKey: true } }),
    ));
    expect(states.map(({ menuSyncState }) => menuSyncState)).toEqual([
      LineMenuSyncState.APPLIED,
      LineMenuSyncState.MISMATCH,
      LineMenuSyncState.UNAVAILABLE,
      LineMenuSyncState.UNAVAILABLE,
      LineMenuSyncState.UNKNOWN,
    ]);
    expect(states.map(({ menuExpectedKey }) => menuExpectedKey)).toEqual([
      "LINKED_INELIGIBLE",
      "LINKED_INELIGIBLE",
      "LINKED_INELIGIBLE",
      "LINKED_INELIGIBLE",
      "LINKED_INELIGIBLE",
    ]);
  });

  it("reconciles a successful workspace switch that arrives during an older menu mutation", async () => {
    const userId = await createOsmHospitalUser();
    const binding = await createBinding(userId);
    const observedAt = new Date();
    await database.lineAccountBinding.update({
      where: { id: binding.id },
      data: { reachability: LineReachability.FRIEND, reachabilityObservedAt: observedAt },
    });
    const chooser = LINE_RICH_MENU_BY_KEY.get("CHOOSER_OSM_HOSPITAL");
    const osmMenu = LINE_RICH_MENU_BY_KEY.get("OSM_OSM_HOSPITAL");
    if (!chooser || !osmMenu) throw new Error("Expected the exact OSM + Hospital menu pair");
    let providerMenu: string | null = "stale-menu";
    let switchReconcile: "RECONCILED" | "BUSY" | "MISSING" | null = null;
    let injectedSwitch = false;
    const provider: LinePresentationProvider = {
      getAlias: async (alias) => alias === chooser.alias ? "chooser-menu" : alias === osmMenu.alias ? "osm-menu" : null,
      listAliases: async () => [
        { richMenuAliasId: chooser.alias, richMenuId: "chooser-menu" },
        { richMenuAliasId: osmMenu.alias, richMenuId: "osm-menu" },
      ],
      getUserMenu: async () => providerMenu,
      linkUserMenu: async (_lineUserId, richMenuId) => {
        providerMenu = richMenuId;
        if (injectedSwitch) return;
        injectedSwitch = true;
        await database.lineAccountBinding.update({
          where: { id: binding.id },
          data: {
            presentationRole: LineWorkspaceRole.OSM,
            presentationRoleSelectedAt: new Date(Date.now() + 1000),
            menuExpectedKey: osmMenu.key,
            menuSyncState: LineMenuSyncState.UNKNOWN,
            menuSyncedAt: null,
          },
        });
        switchReconcile = await reconcileLineBinding(binding.id, { database, provider });
      },
      unlinkUserMenu: async () => undefined,
    };

    await expect(reconcileLineBinding(binding.id, { database, provider })).resolves.toBe("RECONCILED");
    const current = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(switchReconcile).toBe("BUSY");
    expect(current.presentationRole).toBe(LineWorkspaceRole.OSM);
    expect(current.menuExpectedKey).toBe(osmMenu.key);
    expect(current.menuSyncState).toBe(LineMenuSyncState.APPLIED);
    expect(providerMenu).toBe("osm-menu");
  });

  it("recovers a missing workspace webhook only from the exact current eligible-set menu", async () => {
    const [eligibleUserId, staleUserId] = await Promise.all([
      createOsmHospitalUser(),
      createOsmHospitalUser(),
    ]);
    const [eligibleBinding, staleBinding] = await Promise.all([
      createBinding(eligibleUserId),
      createBinding(staleUserId),
    ]);
    await database.lineAccountBinding.updateMany({
      where: { id: { in: [eligibleBinding.id, staleBinding.id] } },
      data: { reachability: LineReachability.FRIEND, reachabilityObservedAt: new Date() },
    });
    const eligibleMenu = LINE_RICH_MENU_BY_KEY.get("OSM_OSM_HOSPITAL");
    const staleMenu = LINE_RICH_MENU_BY_KEY.get("OSM_PATIENT_OSM");
    const chooser = LINE_RICH_MENU_BY_KEY.get("CHOOSER_OSM_HOSPITAL");
    if (!eligibleMenu || !staleMenu || !chooser) throw new Error("Expected exact multi-role catalog variants");

    const recoveredProvider: LinePresentationProvider = {
      getAlias: async (alias) => alias === eligibleMenu.alias ? "osm-current-menu" : null,
      listAliases: async () => [{ richMenuAliasId: eligibleMenu.alias, richMenuId: "osm-current-menu" }],
      getUserMenu: async () => "osm-current-menu",
      linkUserMenu: async () => { throw new Error("Current menu already matches the recovered role"); },
      unlinkUserMenu: async () => undefined,
    };
    const reconciledAt = new Date("2026-10-06T00:05:00.000Z");
    await reconcileLineBinding(eligibleBinding.id, { database, provider: recoveredProvider, now: () => reconciledAt });
    const recovered = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: eligibleBinding.id } });
    expect(recovered.presentationRole).toBe(LineWorkspaceRole.OSM);
    expect(recovered.presentationRoleSelectedAt).toEqual(reconciledAt);
    expect(recovered.menuExpectedKey).toBe(eligibleMenu.key);
    expect(recovered.menuSyncState).toBe(LineMenuSyncState.APPLIED);

    let staleProviderMenu: string | null = "old-osm-menu";
    const staleProvider: LinePresentationProvider = {
      getAlias: async (alias) => alias === chooser.alias ? "chooser-menu" : alias === staleMenu.alias ? "old-osm-menu" : null,
      listAliases: async () => [
        { richMenuAliasId: staleMenu.alias, richMenuId: "old-osm-menu" },
        { richMenuAliasId: chooser.alias, richMenuId: "chooser-menu" },
      ],
      getUserMenu: async () => staleProviderMenu,
      linkUserMenu: async (_lineUserId, richMenuId) => { staleProviderMenu = richMenuId; },
      unlinkUserMenu: async () => undefined,
    };
    await reconcileLineBinding(staleBinding.id, { database, provider: staleProvider });
    const stale = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: staleBinding.id } });
    expect(stale.presentationRole).toBeNull();
    expect(stale.presentationRoleSelectedAt).toBeNull();
    expect(stale.menuExpectedKey).toBe(chooser.key);
    expect(stale.menuSyncState).toBe(LineMenuSyncState.APPLIED);
    expect(staleProviderMenu).toBe("chooser-menu");
  });

  it("persists ordered friendship observations without unlinking DEMI authority", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId);
    const first = new Date("2026-10-06T00:00:00.000Z");
    const later = new Date(first.getTime() + 1000);
    await runSerializableTransaction(database, (transaction) => applyLineReachabilityObservation(transaction, binding.lineUserId ?? "", LineReachability.FRIEND, first));
    await runSerializableTransaction(database, (transaction) => applyLineReachabilityObservation(transaction, binding.lineUserId ?? "", LineReachability.NOT_FRIEND, later));
    await runSerializableTransaction(database, (transaction) => applyLineReachabilityObservation(transaction, binding.lineUserId ?? "", LineReachability.FRIEND, new Date(first.getTime() + 500)));
    const unfollowed = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(unfollowed.unlinkedAt).toBeNull();
    expect(unfollowed.reachability).toBe(LineReachability.NOT_FRIEND);
    expect(isLinePushReachabilityEligible(unfollowed.reachability)).toBe(false);

    await runSerializableTransaction(database, (transaction) => applyLineReachabilityObservation(transaction, binding.lineUserId ?? "", LineReachability.FRIEND, later));
    const conflict = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(conflict.reachability).toBe(LineReachability.UNKNOWN);
    expect(isLinePushReachabilityEligible(conflict.reachability)).toBe(false);
  });

  it("retains cleanup locators after provider timeout or ambiguous successful DELETE read-back", async () => {
    const userId = await createUser();
    const timeoutBinding = await createBinding(userId, { unlinkedAt: new Date(), cleanupState: LineProviderCleanupState.PENDING });
    const ambiguousBinding = await createBinding(userId, {
      unlinkedAt: new Date(),
      cleanupState: LineProviderCleanupState.PENDING,
      fingerprint: fingerprint("second-cleanup-subject"),
    });
    const observedAt = new Date("2026-10-06T00:00:00.000Z");
    const firstAttemptAt = new Date("2026-10-06T00:01:00.000Z");
    await database.lineAccountBinding.updateMany({
      where: { id: { in: [timeoutBinding.id, ambiguousBinding.id] } },
      data: { reachability: LineReachability.FRIEND, reachabilityObservedAt: observedAt },
    });
    const timeoutProvider: LinePresentationProvider = {
      getAlias: async () => null,
      listAliases: async () => [],
      linkUserMenu: async () => undefined,
      getUserMenu: async () => null,
      unlinkUserMenu: async () => { throw new LineFailure("LINE_PROVIDER_TRANSIENT"); },
    };
    const ambiguousProvider: LinePresentationProvider = {
      ...timeoutProvider,
      getUserMenu: async () => "still-linked-menu",
      unlinkUserMenu: async () => undefined,
    };

    await reconcileLineBinding(timeoutBinding.id, { database, provider: timeoutProvider, now: () => firstAttemptAt });
    await reconcileLineBinding(ambiguousBinding.id, { database, provider: ambiguousProvider, now: () => firstAttemptAt });
    const [timeoutResult, ambiguousResult] = await Promise.all([
      database.lineAccountBinding.findUniqueOrThrow({ where: { id: timeoutBinding.id } }),
      database.lineAccountBinding.findUniqueOrThrow({ where: { id: ambiguousBinding.id } }),
    ]);
    expect(timeoutResult.providerCleanupState).toBe(LineProviderCleanupState.UNAVAILABLE);
    expect(timeoutResult.lineUserId).toBe(timeoutBinding.lineUserId);
    expect(timeoutResult.providerCleanupAttemptCount).toBe(1);
    expect(timeoutResult.providerCleanupLastAttemptAt).toEqual(firstAttemptAt);
    expect(ambiguousResult.providerCleanupState).toBe(LineProviderCleanupState.MISMATCH);
    expect(ambiguousResult.lineUserId).toBe(ambiguousBinding.lineUserId);

    const retryProvider: LinePresentationProvider = {
      ...timeoutProvider,
      unlinkUserMenu: vi.fn(async () => undefined),
      getUserMenu: async () => null,
    };
    const tooSoon = new Date(firstAttemptAt.getTime() + 30_000);
    await reconcileLineBinding(timeoutBinding.id, { database, provider: retryProvider, now: () => tooSoon });
    expect(retryProvider.unlinkUserMenu).not.toHaveBeenCalled();
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: timeoutBinding.id }, select: { providerCleanupAttemptCount: true } })).toEqual({ providerCleanupAttemptCount: 1 });

    const retryDue = new Date(firstAttemptAt.getTime() + lineMenuReconcilerInternals.cleanupRetryDelayMs(timeoutBinding.id, 1));
    await reconcileLineBinding(timeoutBinding.id, { database, provider: retryProvider, now: () => retryDue });
    const cleaned = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: timeoutBinding.id } });
    expect(retryProvider.unlinkUserMenu).toHaveBeenCalledOnce();
    expect(cleaned.providerCleanupState).toBe(LineProviderCleanupState.CONFIRMED_CLEAN);
    expect(cleaned.providerCleanupAttemptCount).toBe(2);
    expect(cleaned.lineUserId).toBeNull();
  });

  it("lets a later trusted follow trigger cleanup despite retry backoff", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId, { unlinkedAt: new Date(), cleanupState: LineProviderCleanupState.UNAVAILABLE });
    const priorAttempt = new Date("2026-10-06T00:01:00.000Z");
    const followObservedAt = new Date("2026-10-06T00:01:10.000Z");
    await database.lineAccountBinding.update({
      where: { id: binding.id },
      data: {
        reachability: LineReachability.FRIEND,
        reachabilityObservedAt: new Date("2026-10-06T00:00:00.000Z"),
        providerCleanupAttemptCount: 1,
        providerCleanupLastAttemptAt: priorAttempt,
      },
    });
    await runSerializableTransaction(database, (transaction) => applyLineReachabilityObservation(
      transaction,
      binding.lineUserId ?? "",
      LineReachability.FRIEND,
      followObservedAt,
    ));
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id }, select: { providerCleanupLastAttemptAt: true } })).toEqual({ providerCleanupLastAttemptAt: null });

    const unlink = vi.fn(async () => undefined);
    const provider: LinePresentationProvider = {
      getAlias: async () => null,
      listAliases: async () => [],
      linkUserMenu: async () => undefined,
      getUserMenu: async () => null,
      unlinkUserMenu: unlink,
    };
    await reconcileLineBinding(binding.id, { database, provider, now: () => new Date("2026-10-06T00:01:11.000Z") });
    expect(unlink).toHaveBeenCalledOnce();
    expect(await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id }, select: { providerCleanupState: true, lineUserId: true } })).toEqual({ providerCleanupState: LineProviderCleanupState.CONFIRMED_CLEAN, lineUserId: null });
  });

  it("allows relink during an in-flight stale DELETE and reconciles the new active generation", async () => {
    const userId = await createUser();
    const binding = await createBinding(userId, { unlinkedAt: new Date(), cleanupState: LineProviderCleanupState.PENDING });
    const observedAt = new Date();
    await database.lineAccountBinding.update({ where: { id: binding.id }, data: { reachability: LineReachability.FRIEND, reachabilityObservedAt: observedAt } });
    const deleteStarted = deferred();
    const releaseDelete = deferred();
    let providerMenu: string | null = "stale-menu";
    const ineligibleMenu = LINE_RICH_MENU_BY_KEY.get("LINKED_INELIGIBLE");
    if (!ineligibleMenu) throw new Error("Expected the linked-ineligible menu");
    const provider: LinePresentationProvider = {
      getAlias: async (alias) => alias === ineligibleMenu.alias ? "linked-ineligible-menu" : null,
      listAliases: async () => [],
      getUserMenu: async () => providerMenu,
      linkUserMenu: async (_lineUserId, richMenuId) => { providerMenu = richMenuId; },
      unlinkUserMenu: async () => {
        deleteStarted.resolve();
        await releaseDelete.promise;
        providerMenu = null;
      },
    };

    const reconciliation = reconcileLineBinding(binding.id, { database, provider });
    await deleteStarted.promise;
    await database.lineAccountBinding.update({
      where: { id: binding.id },
      data: {
        unlinkedAt: null,
        lifecycleVersion: { increment: 1 },
        presentationRole: null,
        presentationRoleSelectedAt: null,
        reachability: LineReachability.FRIEND,
        providerCleanupState: null,
        menuExpectedKey: null,
        menuSyncState: LineMenuSyncState.UNKNOWN,
        menuSyncedAt: null,
      },
    });
    releaseDelete.resolve();
    await reconciliation;

    const current = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: binding.id } });
    expect(current.unlinkedAt).toBeNull();
    expect(current.lifecycleVersion).toBe(2);
    expect(current.lineUserId).toBe(binding.lineUserId);
    expect(current.providerCleanupState).toBeNull();
    expect(current.menuSyncState).toBe(LineMenuSyncState.APPLIED);
    expect(providerMenu).toBe("linked-ineligible-menu");
  });
});
