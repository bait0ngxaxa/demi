import "server-only";

import {
  LineMenuSyncState,
  LineReachability,
  LineWebhookEventOutcome,
  LineWebhookEventType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { performance } from "node:perf_hooks";

import { getPrisma } from "@/lib/db/prisma";
import { getLineMessagingEnv } from "@/lib/env/server";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";

import { verifyLineWebhookSignature } from "../adapters/line-webhook-security";
import { LineFailure } from "../domain/line-errors";
import { projectLineMenu } from "../domain/line-projection";
import {
  lineUserIdSchema,
  lineWebhookEnvelopeSchema,
  lineWebhookEventSchema,
} from "../schemas/line-schemas";
import { LINE_RICH_MENU_BY_ALIAS, LINE_WORKSPACE_SWITCH_MARKER } from "../rich-menu/catalog";
import {
  LINE_PATIENT_NEXT_APPOINTMENT_INTENT,
  LINE_PATIENT_NEXT_APPOINTMENT_MARKER,
  LINE_REACTIVE_EXECUTION_AGE_LIMIT_MS,
  type LineReactiveDurableResult,
  type LineReactiveMonotonicClock,
  type LineReactiveWorkItem,
} from "../domain/line-reactive-types";
import { resolveEligibleLineRoles } from "./line-eligibility-service";
import { applyLineReachabilityObservation } from "./line-reachability-service";

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

type ProviderEvent = {
  type: string;
  webhookEventId: string;
  timestamp: number;
  source?: { type: string; userId?: string };
  replyToken?: string;
  postback?: { data?: string; params?: Record<string, string> };
  mode?: unknown;
  deliveryContext?: unknown;
};

type EventEffect = { outcome: "ACCEPTED" | "DUPLICATE" | "IGNORED"; bindingIds: readonly string[] };

function eventTime(timestamp: number): Date | null {
  const value = new Date(timestamp);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type PatientAppointmentClassification =
  | { status: "IGNORED" }
  | { status: "RECEIPT_ONLY"; eventOccurredAt: Date }
  | { status: "REACTIVE"; workItem: LineReactiveWorkItem };

function classifyPatientNextAppointment(
  event: ProviderEvent,
  localExecutionDeadline: number,
): PatientAppointmentClassification | null {
  if (
    event.type !== "postback" ||
    event.postback?.data !== LINE_PATIENT_NEXT_APPOINTMENT_MARKER
  ) {
    return null;
  }

  const eventOccurredAt = eventTime(event.timestamp);
  const lineUserId = event.source?.type === "user" ? event.source.userId : undefined;
  const parsedLineUserId = lineUserIdSchema.safeParse(lineUserId);
  const replyToken = event.replyToken;
  const deliveryContext = isRecord(event.deliveryContext) ? event.deliveryContext : null;
  if (
    !eventOccurredAt ||
    !parsedLineUserId.success ||
    (event.mode !== "active" && event.mode !== "standby") ||
    typeof deliveryContext?.isRedelivery !== "boolean"
  ) {
    return { status: "IGNORED" };
  }

  if (event.mode === "standby" || !replyToken?.trim()) {
    return { status: "RECEIPT_ONLY", eventOccurredAt };
  }

  return {
    status: "REACTIVE",
    workItem: {
      intent: LINE_PATIENT_NEXT_APPOINTMENT_INTENT,
      webhookEventId: event.webhookEventId,
      eventOccurredAt,
      localExecutionDeadline,
      lineUserId: parsedLineUserId.data,
      replyToken,
      isRedelivery: deliveryContext.isRedelivery,
    },
  };
}

async function persistPatientNextAppointmentReceipt(
  event: ProviderEvent,
  eventOccurredAt: Date,
  database: PrismaClient,
): Promise<LineReactiveDurableResult> {
  try {
    await database.$transaction(async (transaction) => {
      await transaction.lineWebhookEventReceipt.create({
        data: {
          webhookEventId: event.webhookEventId,
          eventType: LineWebhookEventType.PATIENT_NEXT_APPOINTMENT,
          eventOccurredAt,
          outcome: LineWebhookEventOutcome.ACCEPTED,
        },
      });
    });
    return { status: "ACCEPTED" };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await database.lineWebhookEventReceipt.findUnique({
        where: { webhookEventId: event.webhookEventId },
        select: { webhookEventId: true, eventType: true, eventOccurredAt: true },
      });
      if (!prior) {
        throw error;
      }
      if (
        prior.eventType === LineWebhookEventType.PATIENT_NEXT_APPOINTMENT &&
        prior.eventOccurredAt.getTime() === eventOccurredAt.getTime()
      ) {
        return { status: "MATCHING_DUPLICATE" };
      }
      return { status: "EVENT_ID_CONFLICT" };
    }
    throw error;
  }
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

export type LineWebhookProcessingResult = {
  readonly accepted: number;
  readonly duplicates: number;
  readonly ignored: number;
  readonly bindingIds: readonly string[];
  readonly reactiveWorkItems: readonly LineReactiveWorkItem[];
};

export type LineWebhookProcessingDependencies = {
  readonly monotonicNow?: LineReactiveMonotonicClock;
};

export async function processLineWebhookRequest(
  request: Request,
  database: PrismaClient = getPrisma(),
  dependencies: LineWebhookProcessingDependencies = {},
): Promise<LineWebhookProcessingResult> {
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const localExecutionDeadline =
    monotonicNow() + LINE_REACTIVE_EXECUTION_AGE_LIMIT_MS;
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
  const bindingIds = new Set<string>();
  const reactiveWorkItems: LineReactiveWorkItem[] = [];
  const patientAppointmentEvents = new Map<string, {
    eventOccurredAt: number;
    reactiveSelected: boolean;
  }>();
  for (const candidate of envelope.data.events) {
    const event = lineWebhookEventSchema.safeParse(candidate);
    if (!event.success) {
      ignored += 1;
      continue;
    }
    const providerEvent = event.data as ProviderEvent;
    if (
      providerEvent.type === "postback" &&
      providerEvent.postback?.data === LINE_PATIENT_NEXT_APPOINTMENT_MARKER
    ) {
      const classification = classifyPatientNextAppointment(
        providerEvent,
        localExecutionDeadline,
      );
      if (!classification || classification.status === "IGNORED") {
        ignored += 1;
        continue;
      }
      const eventOccurredAt =
        classification.status === "REACTIVE"
          ? classification.workItem.eventOccurredAt
          : classification.eventOccurredAt;
      let canonical = patientAppointmentEvents.get(providerEvent.webhookEventId);
      if (canonical) {
        if (canonical.eventOccurredAt !== eventOccurredAt.getTime()) {
          ignored += 1;
          continue;
        }
        duplicates += 1;
      } else {
        const durableResult = await persistPatientNextAppointmentReceipt(
          providerEvent,
          eventOccurredAt,
          database,
        );
        if (durableResult.status === "ACCEPTED") {
          accepted += 1;
        } else if (durableResult.status === "MATCHING_DUPLICATE") {
          duplicates += 1;
        } else {
          ignored += 1;
          continue;
        }
        canonical = { eventOccurredAt: eventOccurredAt.getTime(), reactiveSelected: false };
        patientAppointmentEvents.set(providerEvent.webhookEventId, canonical);
      }

      if (classification.status === "REACTIVE" && !canonical.reactiveSelected) {
        reactiveWorkItems.push(classification.workItem);
        canonical.reactiveSelected = true;
      }
      continue;
    }

    const effect = await persistProviderEvent(providerEvent, database);
    if (effect.outcome === "DUPLICATE") duplicates += 1;
    else if (effect.outcome === "IGNORED") ignored += 1;
    else {
      accepted += 1;
      for (const bindingId of effect.bindingIds) bindingIds.add(bindingId);
    }
  }
  return {
    accepted,
    duplicates,
    ignored,
    bindingIds: [...bindingIds],
    reactiveWorkItems,
  };
}

export const lineWebhookInternals = {
  MAX_WEBHOOK_BODY_BYTES,
  eventTime,
  lineWorkspaceForAlias,
  applyWorkspacePreference,
  classifyPatientNextAppointment,
  persistPatientNextAppointmentReceipt,
};
