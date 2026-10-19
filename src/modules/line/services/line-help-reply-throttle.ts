import "server-only";

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

const THROTTLE_MS = 10 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;
const PURPOSE = "DEMI_LINE_HELP_REPLY_THROTTLE_V1";

type ThrottleDatabase = Pick<PrismaClient, "$executeRaw" | "$queryRaw">;

export type LineHelpReplyThrottle = (lineUserId: string, now: Date) => Promise<boolean>;

function hashThrottleKey(lineUserId: string): string {
  return createHash("sha256").update(`${PURPOSE}:${lineUserId}`).digest("hex");
}

/**
 * Atomically claims the one HELP reply allowed per LINE user per 10 minutes
 * for unmatched text. The row holds only a one-way hash of the LINE user ID
 * and timestamps, never message content. The conditional upsert lets exactly
 * one concurrent claim win across replicas; errors propagate so the caller
 * fails closed and sends nothing.
 */
export function createLineHelpReplyThrottle(database?: ThrottleDatabase): LineHelpReplyThrottle {
  return async (lineUserId, now) => {
    if (!Number.isFinite(now.getTime())) throw new Error("Invalid throttle clock");
    const store = database ?? getPrisma();
    const expiresAt = new Date(now.getTime() + THROTTLE_MS);
    await store.$executeRaw`DELETE FROM "LineConversationReplyThrottle"
      WHERE ctid IN (
        SELECT ctid FROM "LineConversationReplyThrottle"
        WHERE "expiresAt" <= ${now}
        ORDER BY "expiresAt" ASC
        LIMIT ${CLEANUP_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )`;
    const rows = await store.$queryRaw<Array<{ keyHash: string }>>`INSERT INTO "LineConversationReplyThrottle"
      ("keyHash", "lastRepliedAt", "expiresAt")
      VALUES (${hashThrottleKey(lineUserId)}, ${now}, ${expiresAt})
      ON CONFLICT ("keyHash") DO UPDATE
      SET "lastRepliedAt" = EXCLUDED."lastRepliedAt", "expiresAt" = EXCLUDED."expiresAt"
      WHERE "LineConversationReplyThrottle"."expiresAt" <= EXCLUDED."lastRepliedAt"
      RETURNING "keyHash"`;
    return rows.length === 1;
  };
}

export const lineHelpReplyThrottleInternals = {
  THROTTLE_MS,
  CLEANUP_BATCH_SIZE,
  hashThrottleKey,
};
