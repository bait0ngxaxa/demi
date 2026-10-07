import "server-only";

import {
  LineMenuSyncState,
  LineReachability,
  LineWebhookEventOutcome,
  LineWebhookEventType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { getLineMessagingEnv } from "@/lib/env/server";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";

import { verifyLineWebhookSignature } from "../adapters/line-webhook-security";
import { LineFailure } from "../domain/line-errors";
import { projectLineMenu } from "../domain/line-projection";
import { lineWebhookEnvelopeSchema, lineWebhookEventSchema } from "../schemas/line-schemas";
import { LINE_RICH_MENU_BY_ALIAS, LINE_WORKSPACE_SWITCH_MARKER } from "../rich-menu/catalog";
import { resolveEligibleLineRoles } from "./line-eligibility-service";
import { reconcileLineBindingIds } from "./line-menu-reconciler";
import { applyLineReachabilityObservation } from "./line-reachability-service";

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

type ProviderEvent = {
  type: string;
  webhookEventId: string;
  timestamp: number;
  source?: { type: string; userId?: string };
  postback?: { data?: string; params?: Record<string, string> };
};

type EventEffect = { outcome: "ACCEPTED" | "DUPLICATE" | "IGNORED"; bindingIds: readonly string[] };

function eventTime(timestamp: number): Date | null {
  const value = new Date(timestamp);
  return Number.isNaN(value.getTime()) ? null : value;
}

function supportedEventType(event: ProviderEvent): LineWebhookEventType | null {
  if (!eventTime(event.timestamp)) return null;
  if ((event.type === "follow" || event.type === "unfollow") && event.source?.type === "user" && event.source.userId) {
    return event.type === "follow" ? LineWebhookEventType.FOLLOW : LineWebhookEventType.UNFOLLOW;
  }
  if (
    event.type === "postback" && event.source?.type === "user" && event.source.userId &&
    event.postback?.data === LINE_WORKSPACE_SWITCH_MARKER
  ) return LineWebhookEventType.RICHMENUSWITCH;
  return null;
}

function lineWorkspaceForAlias(aliasId: string): { role: "PATIENT" | "OSM" | "HOSPITAL"; key: string } | null {
  const menu = LINE_RICH_MENU_BY_ALIAS.get(aliasId);
  if (!menu) return null;
  const role = menu.key.split("_")[0];
  if (role !== "PATIENT" && role !== "OSM" && role !== "HOSPITAL") return null;
  return { role, key: menu.key };
}

async function applyWorkspacePreference(
  transaction: Prisma.TransactionClient,
  event: ProviderEvent,
  occurredAt: Date,
): Promise<{ outcome: LineWebhookEventOutcome; bindingIds: readonly string[] }> {
  const source = event.source;
  const params = event.postback?.params;
  const userId = source?.type === "user" ? source.userId : undefined;
  if (
    !userId || event.postback?.data !== LINE_WORKSPACE_SWITCH_MARKER ||
    params?.status !== "SUCCESS" || !params.newRichMenuAliasId
  ) {
    return { outcome: LineWebhookEventOutcome.IGNORED, bindingIds: [] };
  }
  const target = lineWorkspaceForAlias(params.newRichMenuAliasId);
  if (!target) return { outcome: LineWebhookEventOutcome.IGNORED, bindingIds: [] };

  const binding = await transaction.lineAccountBinding.findFirst({
    where: { lineUserId: userId, unlinkedAt: null },
    select: {
      id: true,
      userId: true,
      lifecycleVersion: true,
      presentationRole: true,
      presentationRoleSelectedAt: true,
      user: { select: { status: true } },
    },
  });
  if (!binding || binding.user.status !== "ACTIVE") {
    return { outcome: LineWebhookEventOutcome.IGNORED, bindingIds: [] };
  }
  const eligibleRoles = await resolveEligibleLineRoles(binding.userId, transaction);
  const expectedKey = eligibleRoles.length === 1
    ? `${target.role}_DIRECT`
    : `${target.role}_${eligibleRoles.join("_")}`;
  if (eligibleRoles.length === 0 || !eligibleRoles.includes(target.role) || target.key !== expectedKey) {
    return { outcome: LineWebhookEventOutcome.IGNORED, bindingIds: [] };
  }

  const selectedAt = binding.presentationRoleSelectedAt;
  if (selectedAt && occurredAt < selectedAt) {
    return { outcome: LineWebhookEventOutcome.STALE, bindingIds: [binding.id] };
  }
  if (selectedAt && occurredAt.getTime() === selectedAt.getTime()) {
    if (binding.presentationRole === target.role) {
      return { outcome: LineWebhookEventOutcome.STALE, bindingIds: [binding.id] };
    }
    await transaction.lineAccountBinding.update({
      where: { id: binding.id },
      data: {
        presentationRole: null,
        presentationRoleSelectedAt: occurredAt,
        menuExpectedKey: projectLineMenu({ hasBinding: true, active: true, userActive: true, eligibleRoles, presentationRole: null }).menuKey,
        menuSyncState: LineMenuSyncState.UNKNOWN,
      },
    });
    return { outcome: LineWebhookEventOutcome.APPLIED, bindingIds: [binding.id] };
  }

  await transaction.lineAccountBinding.update({
    where: { id: binding.id },
    data: {
      presentationRole: target.role,
      presentationRoleSelectedAt: occurredAt,
      menuExpectedKey: expectedKey,
      menuSyncState: LineMenuSyncState.UNKNOWN,
      menuSyncedAt: null,
    },
  });
  return { outcome: LineWebhookEventOutcome.APPLIED, bindingIds: [binding.id] };
}

async function applySupportedEvent(
  transaction: Prisma.TransactionClient,
  event: ProviderEvent,
): Promise<{ eventType: LineWebhookEventType; outcome: LineWebhookEventOutcome; bindingIds: readonly string[] } | null> {
  const occurredAt = eventTime(event.timestamp);
  if (!occurredAt) return null;
  if (event.type === "follow" || event.type === "unfollow") {
    const source = event.source;
    if (source?.type !== "user" || !source.userId) return null;
    const reachability = event.type === "follow" ? LineReachability.FRIEND : LineReachability.NOT_FRIEND;
    const changed = await applyLineReachabilityObservation(transaction, source.userId, reachability, occurredAt);
    return {
      eventType: event.type === "follow" ? LineWebhookEventType.FOLLOW : LineWebhookEventType.UNFOLLOW,
      outcome: changed.length ? LineWebhookEventOutcome.APPLIED : LineWebhookEventOutcome.IGNORED,
      bindingIds: changed,
    };
  }
  if (event.type === "postback") {
    const applied = await applyWorkspacePreference(transaction, event, occurredAt);
    return { eventType: LineWebhookEventType.RICHMENUSWITCH, ...applied };
  }
  return null;
}

async function persistProviderEvent(
  event: ProviderEvent,
  database: PrismaClient,
): Promise<EventEffect> {
  const occurredAt = eventTime(event.timestamp);
  if (!occurredAt) return { outcome: "IGNORED", bindingIds: [] };
  let effect: EventEffect = { outcome: "IGNORED", bindingIds: [] };
  try {
    await runSerializableTransaction(database, async (transaction) => {
      const eventType = supportedEventType(event);
      if (!eventType) return;
      await transaction.lineWebhookEventReceipt.create({
        data: {
          webhookEventId: event.webhookEventId,
          eventType,
          eventOccurredAt: occurredAt,
          outcome: LineWebhookEventOutcome.IGNORED,
        },
      });
      const supported = await applySupportedEvent(transaction, event);
      if (!supported) return;
      await transaction.lineWebhookEventReceipt.update({
        where: { webhookEventId: event.webhookEventId },
        data: { outcome: supported.outcome },
      });
      effect = {
        outcome: "ACCEPTED",
        bindingIds: supported.outcome === LineWebhookEventOutcome.APPLIED ? supported.bindingIds : [],
      };
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await database.lineWebhookEventReceipt.findUnique({ where: { webhookEventId: event.webhookEventId }, select: { webhookEventId: true } });
      if (prior) return { outcome: "DUPLICATE", bindingIds: [] };
    }
    throw error;
  }
  return effect;
}

export async function readBoundedLineWebhookBody(request: Request): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    throw new LineFailure("LINE_PROVIDER_PERMANENT", "Request body is too large");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        throw new LineFailure("LINE_PROVIDER_PERMANENT", "Request body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function processLineWebhookRequest(
  request: Request,
  database: PrismaClient = getPrisma(),
  reconcile: typeof reconcileLineBindingIds = reconcileLineBindingIds,
): Promise<{ accepted: number; duplicates: number; ignored: number }> {
  const rawBody = await readBoundedLineWebhookBody(request);
  if (!verifyLineWebhookSignature(rawBody, request.headers.get("x-line-signature"))) {
    throw new LineFailure("INVALID_LINE_IDENTITY", "Invalid LINE signature");
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)) as unknown;
  } catch {
    throw new LineFailure("INVALID_LINE_IDENTITY", "Invalid LINE webhook body");
  }
  const envelope = lineWebhookEnvelopeSchema.safeParse(parsedBody);
  if (!envelope.success) throw new LineFailure("INVALID_LINE_IDENTITY", "Invalid LINE webhook envelope");
  const { DEMI_LINE_MESSAGING_BOT_USER_ID } = getLineMessagingEnv();
  if (envelope.data.destination !== DEMI_LINE_MESSAGING_BOT_USER_ID) {
    throw new LineFailure("INVALID_LINE_IDENTITY", "Unexpected LINE webhook destination");
  }

  let accepted = 0;
  let duplicates = 0;
  let ignored = 0;
  for (const candidate of envelope.data.events) {
    const event = lineWebhookEventSchema.safeParse(candidate);
    if (!event.success) {
      ignored += 1;
      continue;
    }
    const effect = await persistProviderEvent(event.data as ProviderEvent, database);
    if (effect.outcome === "DUPLICATE") duplicates += 1;
    else if (effect.outcome === "IGNORED") ignored += 1;
    else {
      accepted += 1;
      if (effect.bindingIds.length) {
        await reconcile(effect.bindingIds).catch(() => ({ reconciled: 0, busy: 0, missing: 0 }));
      }
    }
  }
  return { accepted, duplicates, ignored };
}

export const lineWebhookInternals = {
  MAX_WEBHOOK_BODY_BYTES,
  eventTime,
  lineWorkspaceForAlias,
  applyWorkspacePreference,
};
