import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  HospitalStatus,
  LineMenuSyncState,
  LineReachability,
  LineWebhookEventOutcome,
  LineWebhookEventType,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { LineReplyMessage } from "@/modules/line/adapters/line-messaging-client";
import type { LineHelpWorkItem, LineReactiveOperationalOutcome } from "@/modules/line/domain/line-reactive-types";
import { LINE_APPOINTMENT_REPLY_COPY } from "@/modules/line/presentation/line-appointment-reply";
import { LINE_HELP_REPLY_COPY } from "@/modules/line/presentation/line-help-reply";
import {
  createLineHelpReplyThrottle,
  lineHelpReplyThrottleInternals,
} from "@/modules/line/services/line-help-reply-throttle";
import { executeLineReactiveAppointment } from "@/modules/line/services/line-reactive-appointment-service";
import { executeLineReactiveHelp } from "@/modules/line/services/line-reactive-help-service";
import { processLineWebhookRequest } from "@/modules/line/services/line-webhook-service";
import { scheduleLineReactiveWork } from "@/modules/line/transport/line-reactive-scheduler";

const database = getPrisma();
const channelSecret = "dedicated-demi-line-messaging-secret";
const botUserId = `U${"b".repeat(32)}`;
let connected = false;
const userIds: string[] = [];
const personIds: string[] = [];
const hospitalIds: string[] = [];
const receiptIds: string[] = [];
const throttledLineUserIds: string[] = [];

function requireDisposableDatabase(): void {
  const url = process.env.DEMI_TEST_DATABASE_URL;
  if (
    !url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url ||
    process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)
  ) {
    throw new Error("Verified local disposable PostgreSQL is required for LINE integration tests");
  }
}

function subject(seed: string = randomUUID()): string {
  const lineUserId = `U${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
  throttledLineUserIds.push(lineUserId);
  return lineUserId;
}

/** Valid ULID-alphabet event IDs, unique per test run. */
function webhookEventId(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = createHash("sha256").update(randomUUID()).digest();
  const id = Array.from({ length: 26 }, (_, index) => alphabet[(bytes[index] ?? 0) % 32]).join("");
  receiptIds.push(id);
  return id;
}

async function createWorkforceUser(status: UserStatus = UserStatus.ACTIVE): Promise<string> {
  const marker = randomUUID();
  const person = await database.person.create({
    data: {
      identityKeyHash: createHash("sha256").update(`line-c3-test:${marker}`).digest("hex"),
      givenName: "ทดสอบ",
      familyName: "LINE C3",
    },
    select: { id: true },
  });
  const user = await database.user.create({
    data: { personId: person.id, authSubject: marker, status },
    select: { id: true },
  });
  personIds.push(person.id);
  userIds.push(user.id);
  const hospital = await database.hospital.create({
    data: { hospitalCode: `LC3-${randomUUID().slice(0, 8)}`, name: "โรงพยาบาลทดสอบ C3", status: HospitalStatus.ACTIVE },
    select: { id: true },
  });
  hospitalIds.push(hospital.id);
  await Promise.all([
    database.userRole.create({ data: { userId: user.id, role: Role.OSM } }),
    database.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } }),
    database.osmHospitalRelationship.create({ data: { userId: user.id, hospitalId: hospital.id, status: MembershipStatus.ACTIVE } }),
    database.hospitalMembership.create({
      data: { userId: user.id, hospitalId: hospital.id, membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE },
    }),
  ]);
  return user.id;
}

async function bindLineUser(userId: string, lineUserId: string): Promise<void> {
  await database.lineAccountBinding.create({
    data: {
      userId,
      lineUserId,
      lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"),
      lineSubjectFingerprintKeyId: createHash("sha256").update("test-key-v1").digest("hex"),
      lifecycleVersion: 1,
      reachability: LineReachability.UNKNOWN,
      menuSyncState: LineMenuSyncState.UNKNOWN,
    },
  });
}

function helpWorkItem(lineUserId: string, throttled = false): LineHelpWorkItem {
  return {
    intent: "HELP",
    throttled,
    webhookEventId: webhookEventId(),
    eventOccurredAt: new Date(),
    localExecutionDeadline: performance.now() + 45_000,
    lineUserId,
    replyToken: "integration-only-reply-token",
    isRedelivery: false,
  };
}

function signedWebhook(events: readonly unknown[]): Request {
  const body = JSON.stringify({ destination: botUserId, events });
  return new Request("https://demi.example.org/api/line/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": createHmac("sha256", channelSecret).update(body).digest("base64"),
    },
    body,
  });
}

function textEvent(id: string, lineUserId: string, text: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "message",
    webhookEventId: id,
    timestamp: Date.now(),
    source: { type: "user", userId: lineUserId },
    replyToken: "integration-only-reply-token",
    mode: "active",
    deliveryContext: { isRedelivery: false },
    message: { id: "100001", type: "text", quoteToken: "integration-quote-token", text },
    ...overrides,
  };
}

async function clearFixtures(): Promise<void> {
  if (receiptIds.length) {
    await database.lineWebhookEventReceipt.deleteMany({ where: { webhookEventId: { in: [...receiptIds] } } });
    receiptIds.splice(0);
  }
  if (throttledLineUserIds.length) {
    await database.lineConversationReplyThrottle.deleteMany({
      where: { keyHash: { in: throttledLineUserIds.map(lineHelpReplyThrottleInternals.hashThrottleKey) } },
    });
    throttledLineUserIds.splice(0);
  }
  if (userIds.length) {
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

describe("Phase LINE-QA.C3 conversational replies on PostgreSQL", () => {
  beforeAll(async () => {
    requireDisposableDatabase();
    await database.$connect();
    connected = true;
  });

  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_SECRET", channelSecret);
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "dedicated-demi-line-access-token");
    vi.stubEnv("DEMI_LINE_MESSAGING_BOT_USER_ID", botUserId);
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
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

  it("stores text events as intent-only receipts and keeps message text out of rows and logs", async () => {
    const privateText = `ข้อความส่วนตัว-${randomUUID()}`;
    const lineUserId = subject();
    const ids = [webhookEventId(), webhookEventId(), webhookEventId(), webhookEventId()];
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level));

    const result = await processLineWebhookRequest(signedWebhook([
      textEvent(ids[0] as string, lineUserId, " นัดหมาย "),
      textEvent(ids[1] as string, lineUserId, privateText),
      textEvent(ids[2] as string, lineUserId, privateText, { mode: "standby", replyToken: undefined }),
      textEvent(ids[3] as string, lineUserId, privateText, { source: { type: "group", groupId: `C${"1".repeat(32)}`, userId: lineUserId } }),
    ]), database);

    expect(result).toMatchObject({ accepted: 3, duplicates: 0, ignored: 1 });
    const receipts = await database.lineWebhookEventReceipt.findMany({
      where: { webhookEventId: { in: ids } },
      orderBy: { webhookEventId: "asc" },
    });
    expect(Object.fromEntries(receipts.map(({ webhookEventId: id, eventType, outcome }) => [id, { eventType, outcome }]))).toEqual({
      [ids[0] as string]: { eventType: LineWebhookEventType.PATIENT_NEXT_APPOINTMENT, outcome: LineWebhookEventOutcome.ACCEPTED },
      [ids[1] as string]: { eventType: LineWebhookEventType.HELP, outcome: LineWebhookEventOutcome.ACCEPTED },
      [ids[2] as string]: { eventType: LineWebhookEventType.HELP, outcome: LineWebhookEventOutcome.ACCEPTED },
    });

    const helpItems = result.reactiveWorkItems.filter((item): item is LineHelpWorkItem => item.intent === "HELP");
    const replyMessages = vi.fn<(token: string, messages: readonly LineReplyMessage[]) => Promise<void>>(async () => undefined);
    let afterCallback: (() => Promise<void>) | undefined;
    scheduleLineReactiveWork(helpItems, {
      registerAfter: (callback) => { afterCallback = callback; },
      execute: (item, dependencies): Promise<LineReactiveOperationalOutcome> => executeLineReactiveHelp(
        item as LineHelpWorkItem,
        { ...dependencies, database, replyMessages },
      ),
    });
    await afterCallback?.();
    expect(replyMessages).toHaveBeenCalledOnce();

    const storedRows = await database.$queryRaw<Array<{ row: string }>>(Prisma.sql`
      SELECT row_to_json(r)::text AS row FROM "LineWebhookEventReceipt" r WHERE r."webhookEventId" IN (${Prisma.join(ids)})
      UNION ALL
      SELECT row_to_json(t)::text AS row FROM "LineConversationReplyThrottle" t
      WHERE t."keyHash" = ${lineHelpReplyThrottleInternals.hashThrottleKey(lineUserId)}
    `);
    expect(storedRows).toHaveLength(4);
    const loggedArguments = logs.flatMap((spy) => spy.mock.calls.flat());
    for (const serialized of [JSON.stringify(storedRows), JSON.stringify(loggedArguments)]) {
      expect(serialized).not.toContain(privateText);
      expect(serialized).not.toContain("นัดหมาย");
      expect(serialized).not.toContain(lineUserId);
      expect(serialized).not.toContain("integration-only-reply-token");
      expect(serialized).not.toContain(LINE_HELP_REPLY_COPY.INELIGIBLE);
    }
    expect(loggedArguments).toContainEqual({ HELP: { REFUSED_INELIGIBLE: 1 } });
  });

  it("allows one unmatched-text HELP reply per LINE user per 10 minutes and stores only a hash", async () => {
    const throttle = createLineHelpReplyThrottle(database);
    const lineUserId = subject();
    const otherLineUserId = subject();
    const start = new Date();

    await expect(throttle(lineUserId, start)).resolves.toBe(true);
    await expect(throttle(lineUserId, new Date(start.getTime() + 1_000))).resolves.toBe(false);
    await expect(throttle(lineUserId, new Date(start.getTime() + lineHelpReplyThrottleInternals.THROTTLE_MS - 1))).resolves.toBe(false);
    await expect(throttle(otherLineUserId, start)).resolves.toBe(true);
    await expect(throttle(lineUserId, new Date(start.getTime() + lineHelpReplyThrottleInternals.THROTTLE_MS))).resolves.toBe(true);

    const row = await database.lineConversationReplyThrottle.findUniqueOrThrow({
      where: { keyHash: lineHelpReplyThrottleInternals.hashThrottleKey(lineUserId) },
    });
    expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(row.lastRepliedAt).toEqual(new Date(start.getTime() + lineHelpReplyThrottleInternals.THROTTLE_MS));
    expect(JSON.stringify(row)).not.toContain(lineUserId);
  });

  it("lets exactly one concurrent claim win across connections", async () => {
    const throttle = createLineHelpReplyThrottle(database);
    const lineUserId = subject();
    const now = new Date();

    const claims = await Promise.all(Array.from({ length: 8 }, () => throttle(lineUserId, now)));

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("prunes expired throttle rows in bounded batches", async () => {
    const throttle = createLineHelpReplyThrottle(database);
    const expiredLineUserId = subject();
    const now = new Date();
    await database.lineConversationReplyThrottle.create({
      data: {
        keyHash: lineHelpReplyThrottleInternals.hashThrottleKey(expiredLineUserId),
        lastRepliedAt: new Date(now.getTime() - 2 * lineHelpReplyThrottleInternals.THROTTLE_MS),
        expiresAt: new Date(now.getTime() - lineHelpReplyThrottleInternals.THROTTLE_MS),
      },
    });

    await expect(throttle(subject(), now)).resolves.toBe(true);

    await expect(database.lineConversationReplyThrottle.count({
      where: { keyHash: lineHelpReplyThrottleInternals.hashThrottleKey(expiredLineUserId) },
    })).resolves.toBe(0);
  });

  it("builds HELP from the exact active binding's current roles and refuses inactive or unbound users alike", async () => {
    const activeLineUserId = subject();
    const suspendedLineUserId = subject();
    await bindLineUser(await createWorkforceUser(), activeLineUserId);
    await bindLineUser(await createWorkforceUser(UserStatus.SUSPENDED), suspendedLineUserId);
    const replies: Array<readonly LineReplyMessage[]> = [];
    const replyMessages = vi.fn(async (_token: string, messages: readonly LineReplyMessage[]) => {
      replies.push(messages);
    });

    await expect(executeLineReactiveHelp(helpWorkItem(activeLineUserId), { database, replyMessages }))
      .resolves.toBe("COMPLETED_HELP");
    await expect(executeLineReactiveHelp(helpWorkItem(suspendedLineUserId), { database, replyMessages }))
      .resolves.toBe("REFUSED_INELIGIBLE");
    await expect(executeLineReactiveHelp(helpWorkItem(subject()), { database, replyMessages }))
      .resolves.toBe("REFUSED_INELIGIBLE");

    expect(replies[0]?.[0]?.text).toBe(LINE_HELP_REPLY_COPY.WORKFORCE);
    expect(replies[0]?.[0]?.quickReply?.items.map(({ action }) => action.type === "uri" ? action.uri : action.text)).toEqual([
      "https://demi.example.org/app/patients/assigned",
      "https://demi.example.org/app/patients/assigned?task=screening",
      "https://demi.example.org/app/patients/assigned?task=followup",
      "https://demi.example.org/app",
    ]);
    expect(replies[1]).toEqual(replies[2]);
    expect(replies[1]?.[0]?.text).toBe(LINE_HELP_REPLY_COPY.INELIGIBLE);
  });

  it("answers a next-appointment keyword from a workforce-only binding with the role-aware HELP menu", async () => {
    const workforceLineUserId = subject();
    const suspendedLineUserId = subject();
    const unboundLineUserId = subject();
    await bindLineUser(await createWorkforceUser(), workforceLineUserId);
    await bindLineUser(await createWorkforceUser(UserStatus.SUSPENDED), suspendedLineUserId);
    const ids = [webhookEventId(), webhookEventId(), webhookEventId()];

    const result = await processLineWebhookRequest(signedWebhook([
      textEvent(ids[0] as string, workforceLineUserId, "นัด"),
      textEvent(ids[1] as string, suspendedLineUserId, "นัดหมาย"),
      textEvent(ids[2] as string, unboundLineUserId, "นัดถัดไป"),
    ]), database);
    expect(result.reactiveWorkItems.map(({ intent }) => intent)).toEqual(["PATIENT_NEXT_APPOINTMENT", "PATIENT_NEXT_APPOINTMENT", "PATIENT_NEXT_APPOINTMENT"]);

    const outcomes = new Map<string, LineReactiveOperationalOutcome>();
    const messageReplies = new Map<string, readonly LineReplyMessage[]>();
    const textReplies = new Map<string, string>();
    for (const item of result.reactiveWorkItems) {
      outcomes.set(item.lineUserId, await executeLineReactiveAppointment(item, {
        database,
        replyMessages: async (_token, messages) => { messageReplies.set(item.lineUserId, messages); },
        replyText: async (_token, text) => { textReplies.set(item.lineUserId, text); },
      }));
    }

    expect(outcomes.get(workforceLineUserId)).toBe("COMPLETED_HELP");
    expect(textReplies.has(workforceLineUserId)).toBe(false);
    const help = messageReplies.get(workforceLineUserId)?.[0];
    expect(help?.text).toBe(LINE_HELP_REPLY_COPY.WORKFORCE);
    expect(help?.quickReply?.items.map(({ action }) => action.label)).toEqual(["ผู้ป่วยที่ดูแล", "คัดกรองผู้ป่วย", "บันทึกติดตาม", "งานโรงพยาบาล"]);
    for (const ineligible of [suspendedLineUserId, unboundLineUserId]) {
      expect(outcomes.get(ineligible)).toBe("REFUSED_INELIGIBLE");
      expect(messageReplies.has(ineligible)).toBe(false);
      expect(textReplies.get(ineligible)).toBe(LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE);
    }
  });
});
