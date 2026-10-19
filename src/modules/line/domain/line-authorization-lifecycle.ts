import { createHash } from "node:crypto";
import { z } from "zod";
import type { LineAuthorizationLifecycle } from "@prisma/client";

/**
 * Version of the server-derived channel tuple. Rows persisted under an older
 * tuple definition keep their own `tupleKey`/`tupleDefinition` and remain
 * historical obligations; they are never recomputed or remapped.
 */
export const LINE_CHANNEL_TUPLE_VERSION = "LINE_CHANNEL_V2";
/** Fixed fifth slot required by the persisted five-string tuple CHECK; not a deployment identity. */
const LINE_CHANNEL_TUPLE_SOURCE = "server-config";

const channelSchema = z.object({
  kind: z.enum(["ACCOUNT", "MINI"]),
  channelId: z.string().regex(/^\d{4,20}$/u),
  environment: z.enum(["ACCOUNT", "DEVELOPING", "REVIEW", "PUBLISHED"]),
}).strict().superRefine((channel, context) => {
  if ((channel.kind === "ACCOUNT") !== (channel.environment === "ACCOUNT")) {
    context.addIssue({ code: "custom", message: "Invalid channel boundary" });
  }
});

/** Derived from server configuration only, never parsed from an end-user request. */
export const lineChannelInventorySchema = z.object({
  channels: z.array(channelSchema).min(1).max(2),
}).strict().superRefine((inventory, context) => {
  if (inventory.channels.filter((channel) => channel.kind === "ACCOUNT").length !== 1 ||
      new Set(inventory.channels.map((channel) => channel.channelId)).size !== inventory.channels.length) {
    context.addIssue({ code: "custom", message: "Exactly one Account and at most one distinct MINI channel" });
  }
});

export type LineChannelInventory = z.infer<typeof lineChannelInventorySchema>;
export type LineChannel = z.infer<typeof channelSchema>;
export type LineProviderEvidence = "PROVIDER_204" | "PROVIDER_REJECTED" | "INVALID_RESPONSE" | "POSSIBLY_DISPATCHED" | "KNOWN_NOT_DISPATCHED";

export function lineChannelTupleKey(channel: LineChannel): string {
  return createHash("sha256").update(lineChannelTupleDefinition(channel)).digest("hex");
}

/**
 * Same five-string shape as the pre-B2.4 `[provider, kind, channelId,
 * environment, deployment]` tuple, so the existing database CHECK applies
 * unchanged. Slots 0 and 4 are fixed format markers, never Provider ownership
 * or deployment evidence; Provider pairing is enforced by LINE subject equality.
 */
export function lineChannelTupleDefinition(channel: LineChannel): string {
  return JSON.stringify([LINE_CHANNEL_TUPLE_VERSION, channel.kind, channel.channelId, channel.environment, LINE_CHANNEL_TUPLE_SOURCE]);
}

/** Display label from the persisted definition; both tuple versions keep `kind` at index 1. */
export function lineChannelDisplayName(tupleDefinition: string): string {
  try {
    const kind: unknown = (JSON.parse(tupleDefinition) as unknown[])[1];
    if (kind === "ACCOUNT") return "LINE Login ของ DEMI";
    if (kind === "MINI") return "DEMI MINI App";
  } catch {
    // Unreadable historical definitions still display as a connected DEMI app.
  }
  return "แอป DEMI ที่เคยเชื่อมต่อ";
}

export function lineObligationSetDigest(rows: readonly LineAuthorizationLifecycle[], inventory: LineChannelInventory): string {
  return createHash("sha256").update(JSON.stringify([
    LINE_CHANNEL_TUPLE_VERSION,
    inventory.channels.map(lineChannelTupleKey).sort(),
    rows.map((row) => [row.id, row.bindingVersion, row.tupleKey]).sort(),
  ])).digest("hex");
}

export function isLineObligationSatisfied(row: LineAuthorizationLifecycle): boolean {
  return row.applicability === "PROVEN_ABSENT" || row.recoveryReleasedAt !== null ||
    (row.remoteOutcome === "REMOTE_CONFIRMED" && row.settledAt !== null);
}

export function isLineRecoveryEligible(row: LineAuthorizationLifecycle, now: Date): boolean {
  if (isLineObligationSatisfied(row) || !row.requestedAt) return false;
  // A reservation is possibly dispatched even if the process died before I/O.
  if (row.reservedAt && !row.settledAt && row.reason === "ATTEMPT_RESERVED") {
    return now.getTime() >= row.reservedAt.getTime() + 10_000;
  }
  return row.remoteOutcome === "REMOTE_UNCONFIRMED";
}

export function lineObligationStatus(row: LineAuthorizationLifecycle):
  "REMOTE_CONFIRMED" | "RECOVERY_RELEASED_UNVERIFIED" | "REMOTE_UNCONFIRMED" | "PENDING" | "OBSERVED" | "PROVEN_ABSENT" {
  // A late 204 cannot erase the fact that recovery may have acquired new consent.
  if (row.recoveryReleasedAt) return "RECOVERY_RELEASED_UNVERIFIED";
  if (row.applicability === "PROVEN_ABSENT") return "PROVEN_ABSENT";
  return row.remoteOutcome;
}
