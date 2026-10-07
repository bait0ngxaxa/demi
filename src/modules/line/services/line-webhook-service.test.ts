import { createHmac } from "node:crypto";

import {
  LineReachability,
  LineWorkspaceRole,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_RICH_MENU_BY_KEY, LINE_WORKSPACE_SWITCH_MARKER } from "../rich-menu/catalog";
import { lineWebhookInternals, processLineWebhookRequest } from "./line-webhook-service";

const secret = "dedicated-demi-line-messaging-secret";
const botUserId = `U${"b".repeat(32)}`;
const lineUserId = `U${"a".repeat(32)}`;
const eventPrefix = "01ARZ3NDEKTSV4RRFFQ69G5F";

function eventId(suffix: string): string {
  return `${eventPrefix}${suffix.padStart(2, "0")}`;
}

function signedRequest(body: string, signatureBody = body): Request {
  const signature = createHmac("sha256", secret).update(signatureBody).digest("base64");
  return new Request("https://demi.example.org/api/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": signature, "content-type": "application/json" },
    body,
  });
}

function follow(id: string, type = "follow", userId = lineUserId, timestamp = 1_791_254_400_000) {
  return { type, webhookEventId: id, timestamp, source: { type: "user", userId } };
}

function createDatabase() {
  const binding = {
    id: "1a9c6559-3f23-44b6-b920-07d176777772",
    userId: "83da3ab8-2895-4cab-bb63-19f807246288",
    lineUserId,
    unlinkedAt: null,
    lifecycleVersion: 1,
    reachability: LineReachability.UNKNOWN as LineReachability,
    reachabilityObservedAt: null as Date | null,
    presentationRole: null as LineWorkspaceRole | null,
    presentationRoleSelectedAt: null as Date | null,
    menuExpectedKey: null as string | null,
    menuSyncState: "UNKNOWN",
  };
  const eligibleUser = {
    id: binding.userId,
    personId: "5d8c28a8-865f-4d2c-a82d-638e3a07ed2f",
    status: "ACTIVE",
    roles: [{ role: "OSM" }],
    memberships: [],
    osmHospitalRelationships: [{ status: "ACTIVE", hospital: { status: "ACTIVE" } }],
  };
  const receipts = new Map<string, unknown>();
  const transaction = {
    $queryRaw: vi.fn(async () => []),
    lineAccountBinding: {
      findMany: vi.fn(async () => [binding]),
      findFirst: vi.fn(async () => ({ ...binding, user: { status: "ACTIVE" } })),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(binding, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(binding, data);
        return binding;
      }),
    },
    user: { findUnique: vi.fn(async () => eligibleUser) },
    lineWebhookEventReceipt: {
      create: vi.fn(async ({ data }: { data: { webhookEventId: string } }) => {
        if (receipts.has(data.webhookEventId)) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate receipt", { code: "P2002", clientVersion: "test" });
        }
        receipts.set(data.webhookEventId, data);
        return data;
      }),
      update: vi.fn(async ({ where, data }: { where: { webhookEventId: string }; data: Record<string, unknown> }) => {
        const prior = receipts.get(where.webhookEventId);
        if (!prior || typeof prior !== "object") throw new Error("expected an event receipt created in the current transaction");
        const updated = { ...prior, ...data };
        receipts.set(where.webhookEventId, updated);
        return updated;
      }),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => {
      const before = structuredClone(binding);
      const receiptsBefore = new Map(receipts);
      try {
        return await operation(transaction);
      } catch (error: unknown) {
        Object.assign(binding, before);
        receipts.clear();
        for (const [id, receipt] of receiptsBefore) receipts.set(id, receipt);
        throw error;
      }
    }),
    lineWebhookEventReceipt: {
      findUnique: vi.fn(async ({ where }: { where: { webhookEventId: string } }) => receipts.get(where.webhookEventId) ?? null),
    },
  };
  return { database: database as unknown as PrismaClient, transaction, binding, receipts };
}

function envelope(events: readonly unknown[], destination = botUserId, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ destination, events, ...extra });
}

describe("LINE webhook ingestion", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_SECRET", secret);
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "dedicated-demi-line-access-token");
    vi.stubEnv("DEMI_LINE_MESSAGING_BOT_USER_ID", botUserId);
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("accepts an empty event array and unknown additive fields without mutation", async () => {
    const harness = createDatabase();
    const body = envelope([], botUserId, { futureEnvelopeField: { ignored: true } });
    await expect(processLineWebhookRequest(signedRequest(body), harness.database)).resolves.toEqual({ accepted: 0, duplicates: 0, ignored: 0, bindingIds: [] });
    expect(harness.database.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a signature over different bytes and rejects the wrong destination", async () => {
    const harness = createDatabase();
    const body = envelope([]);
    await expect(processLineWebhookRequest(signedRequest(body, `${body} `), harness.database)).rejects.toMatchObject({ code: "INVALID_LINE_IDENTITY" });
    await expect(processLineWebhookRequest(signedRequest(envelope([], lineUserId)), harness.database)).rejects.toMatchObject({ code: "INVALID_LINE_IDENTITY" });
    expect(harness.database.$transaction).not.toHaveBeenCalled();
  });

  it("enforces the exact local 1 MiB cap and has no event-count cap", async () => {
    const harness = createDatabase();
    const prefix = `{"destination":"${botUserId}","events":[],"future":"`;
    const suffix = `"}`;
    const exactBody = `${prefix}${"x".repeat(lineWebhookInternals.MAX_WEBHOOK_BODY_BYTES - prefix.length - suffix.length)}${suffix}`;
    await expect(processLineWebhookRequest(signedRequest(exactBody), harness.database)).resolves.toMatchObject({ accepted: 0 });

    const oversized = `${exactBody} `;
    await expect(processLineWebhookRequest(signedRequest(oversized), harness.database)).rejects.toMatchObject({ code: "LINE_PROVIDER_PERMANENT" });

    const futureEvents = Array.from({ length: 101 }, (_value, index) => ({
      type: "future_event",
      webhookEventId: eventId(`${"0123456789ABCDEFGHJKMNPQRSTVWXYZ"[index >> 5]}${"0123456789ABCDEFGHJKMNPQRSTVWXYZ"[index & 31]}`),
      timestamp: 1_791_254_400_000,
      additive: true,
    }));
    const result = await processLineWebhookRequest(signedRequest(envelope(futureEvents)), harness.database);
    expect(result).toEqual({ accepted: 0, duplicates: 0, ignored: 101, bindingIds: [] });
    expect(harness.transaction.lineWebhookEventReceipt.create).not.toHaveBeenCalled();
  });

  it("skips malformed, group, and unsupported siblings while atomically recording a valid follow", async () => {
    const harness = createDatabase();
    const supported = [
      follow(eventId("1")),
      follow(eventId("2"), "follow", "", 1_791_254_400_001),
      follow(eventId("3"), "follow", lineUserId, 1_791_254_400_002),
      { type: "message", webhookEventId: eventId("4"), timestamp: 1_791_254_400_003, source: { type: "user", userId: lineUserId }, message: { type: "text", text: "ignored" } },
      { type: "follow", webhookEventId: "invalid", timestamp: 1_791_254_400_004 },
    ];
    const result = await processLineWebhookRequest(signedRequest(envelope(supported)), harness.database);
    expect(result.accepted).toBe(2);
    expect(result.ignored).toBe(3);
    expect(result.bindingIds).toEqual([harness.binding.id]);
    expect(harness.binding.reachability).toBe(LineReachability.FRIEND);
    expect(harness.receipts.size).toBe(2);
  });

  it("deduplicates redelivery without replaying its binding mutation", async () => {
    const harness = createDatabase();
    const body = envelope([follow(eventId("5"))]);
    await expect(processLineWebhookRequest(signedRequest(body), harness.database)).resolves.toEqual({
      accepted: 1,
      duplicates: 0,
      ignored: 0,
      bindingIds: [harness.binding.id],
    });
    const observedAt = harness.binding.reachabilityObservedAt;
    await expect(processLineWebhookRequest(signedRequest(body), harness.database)).resolves.toEqual({
      accepted: 0,
      duplicates: 1,
      ignored: 0,
      bindingIds: [],
    });
    expect(harness.binding.reachability).toBe(LineReachability.FRIEND);
    expect(harness.binding.reachabilityObservedAt).toEqual(observedAt);
  });

  it("syncs Option C only for a known successful alias and currently eligible workspace", async () => {
    const harness = createDatabase();
    const osmMenu = LINE_RICH_MENU_BY_KEY.get("OSM_DIRECT");
    if (!osmMenu) throw new Error("Expected OSM direct menu");
    const valid = {
      type: "postback",
      webhookEventId: eventId("6"),
      timestamp: 1_791_254_400_010,
      source: { type: "user", userId: lineUserId },
      postback: { data: LINE_WORKSPACE_SWITCH_MARKER, params: { status: "SUCCESS", newRichMenuAliasId: osmMenu.alias } },
      futureEventField: "ignored",
    };
    const result = await processLineWebhookRequest(signedRequest(envelope([valid])), harness.database);
    expect(result.bindingIds).toEqual([harness.binding.id]);
    expect(harness.binding.presentationRole).toBe(LineWorkspaceRole.OSM);

    const updateCount = harness.transaction.lineAccountBinding.update.mock.calls.length;
    harness.binding.presentationRole = null;
    harness.binding.presentationRoleSelectedAt = null;
    await expect(processLineWebhookRequest(signedRequest(envelope([valid])), harness.database))
      .resolves.toEqual({ accepted: 0, duplicates: 1, ignored: 0, bindingIds: [] });
    expect(harness.binding.presentationRole).toBeNull();
    expect(harness.transaction.lineAccountBinding.update).toHaveBeenCalledTimes(updateCount);

    const previousRole = harness.binding.presentationRole;
    const wrongMarker = { ...valid, webhookEventId: eventId("7"), postback: { ...valid.postback, data: "client-value" } };
    const unknownStatus = { ...valid, webhookEventId: eventId("8"), postback: { ...valid.postback, params: { ...valid.postback.params, status: "FUTURE" } } };
    const unknownAlias = { ...valid, webhookEventId: eventId("9"), postback: { ...valid.postback, params: { status: "SUCCESS", newRichMenuAliasId: "future_alias" } } };
    const ignoredResult = await processLineWebhookRequest(signedRequest(envelope([wrongMarker, unknownStatus, unknownAlias])), harness.database);
    expect(ignoredResult.bindingIds).toEqual([]);
    expect(harness.binding.presentationRole).toBe(previousRole);
  });

  it("makes equal timestamp conflicts UNKNOWN and ignores older observations", async () => {
    const harness = createDatabase();
    const timestamp = 1_791_254_400_020;
    await processLineWebhookRequest(signedRequest(envelope([
      follow(eventId("A"), "follow", lineUserId, timestamp),
      follow(eventId("B"), "unfollow", lineUserId, timestamp),
    ])), harness.database);
    expect(harness.binding.reachability).toBe(LineReachability.UNKNOWN);
    expect(harness.binding.reachabilityObservedAt).toEqual(new Date(timestamp));

    await processLineWebhookRequest(signedRequest(envelope([
      follow(eventId("C"), "follow", lineUserId, timestamp - 1),
    ])), harness.database);
    expect(harness.binding.reachability).toBe(LineReachability.UNKNOWN);
    expect(harness.transaction.lineAccountBinding.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reachability: LineReachability.UNKNOWN }),
    }));
  });

  it("does not persist a switch postback from another source or for a revoked workspace", async () => {
    const harness = createDatabase();
    const osmMenu = LINE_RICH_MENU_BY_KEY.get("OSM_DIRECT");
    if (!osmMenu) throw new Error("Expected OSM direct menu");
    const event = {
      type: "postback",
      webhookEventId: eventId("D"),
      timestamp: 1_791_254_400_030,
      source: { type: "group", userId: lineUserId },
      postback: { data: LINE_WORKSPACE_SWITCH_MARKER, params: { status: "SUCCESS", newRichMenuAliasId: osmMenu.alias } },
    };
    await processLineWebhookRequest(signedRequest(envelope([event])), harness.database);
    expect(harness.transaction.lineAccountBinding.update).not.toHaveBeenCalled();

    harness.transaction.user.findUnique.mockResolvedValueOnce({
      id: harness.binding.userId,
      personId: "5d8c28a8-865f-4d2c-a82d-638e3a07ed2f",
      status: "ACTIVE",
      roles: [],
      memberships: [],
      osmHospitalRelationships: [],
    });
    const revoked = { ...event, webhookEventId: eventId("E"), source: { type: "user", userId: lineUserId } };
    await processLineWebhookRequest(signedRequest(envelope([revoked])), harness.database);
    expect(harness.binding.presentationRole).toBeNull();
  });
});
