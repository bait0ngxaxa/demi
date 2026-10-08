import { createHash } from "node:crypto";
import { z } from "zod";
import type { LineAuthorizationLifecycle } from "@prisma/client";

const reference = z.string().regex(/^[A-Za-z0-9._:/-]{1,128}$/u);
const channelSchema = z.object({
  kind: z.enum(["ACCOUNT", "MINI"]),
  providerReference: reference,
  channelId: z.string().regex(/^\d{4,20}$/u),
  environment: z.enum(["ACCOUNT", "DEVELOPING", "REVIEW", "PUBLISHED"]),
  deploymentReference: reference,
  exclusionReference: reference.optional(),
}).strict().superRefine((channel, context) => {
  if ((channel.kind === "ACCOUNT") !== (channel.environment === "ACCOUNT") ||
      (channel.kind === "ACCOUNT" && channel.exclusionReference)) {
    context.addIssue({ code: "custom", message: "Invalid channel boundary" });
  }
});

/** Server/operator inventory, never parsed from an end-user request. */
export const lineChannelInventorySchema = z.object({
  revision: reference,
  channels: z.array(channelSchema).min(1).max(8),
  miniExclusionReference: reference.optional(),
}).strict().superRefine((inventory, context) => {
  if (inventory.channels.filter((channel) => channel.kind === "ACCOUNT").length !== 1 ||
      (!inventory.channels.some((channel) => channel.kind === "MINI") && !inventory.miniExclusionReference) ||
      new Set(inventory.channels.map(lineChannelTupleKey)).size !== inventory.channels.length) {
    context.addIssue({ code: "custom", message: "Reviewed channel inventory required" });
  }
});

export type LineChannelInventory = z.infer<typeof lineChannelInventorySchema>;
export type LineChannel = z.infer<typeof channelSchema>;

export function lineChannelTupleKey(channel: LineChannel): string {
  return createHash("sha256").update(lineChannelTupleDefinition(channel)).digest("hex");
}

export function lineChannelTupleDefinition(channel: LineChannel): string {
  return JSON.stringify([
    channel.providerReference, channel.kind, channel.channelId,
    channel.environment, channel.deploymentReference,
  ]);
}

export function lineObligationSetDigest(rows: readonly LineAuthorizationLifecycle[], inventory: LineChannelInventory): string {
  return createHash("sha256").update(JSON.stringify([
    inventory.revision,
    inventory.miniExclusionReference ?? null,
    inventory.channels.map((channel) => [lineChannelTupleKey(channel), channel.exclusionReference ?? null]).sort(),
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
