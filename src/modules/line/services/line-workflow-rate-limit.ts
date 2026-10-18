import "server-only";

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

import { LineWorkflowFailure } from "../domain/line-workflow-errors";

const WINDOW_MS = 5 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;
const PURPOSE = "DEMI_LINE_WORKFLOW_RATE_LIMIT_V1";

export const LINE_WORKFLOW_RATE_LIMITS = {
  VERIFY_GLOBAL: 600,
  VERIFY_USER: 10,
  ACKNOWLEDGE: 60,
  CANCELLATION_REQUEST: 20,
} as const;

export type LineWorkflowRateLimitCategory = keyof typeof LINE_WORKFLOW_RATE_LIMITS;
export type LineWorkflowRateLimiter = {
  consume(category: LineWorkflowRateLimitCategory, principal: string, now: Date): Promise<boolean>;
};

type RateLimitDatabase = Pick<PrismaClient, "$executeRaw" | "$queryRaw">;

function hashRateLimitKey(category: LineWorkflowRateLimitCategory, principal: string): string {
  return createHash("sha256").update(`${PURPOSE}:${category}:${principal}`).digest("hex");
}

function rateLimitWindow(now: Date): { startsAt: Date; expiresAt: Date } {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
  const start = Math.floor(timestamp / WINDOW_MS) * WINDOW_MS;
  return { startsAt: new Date(start), expiresAt: new Date(start + 2 * WINDOW_MS) };
}

/**
 * PostgreSQL is the shared limiter store: one atomic capped upsert per fixed
 * bucket works across replicas. Keys contain only a one-way hash of a global
 * marker or authenticated DEMI User ID. Expired rows are pruned in bounded
 * batches; a missing table or database outage fails closed.
 */
export function createLineWorkflowRateLimiter(
  database?: RateLimitDatabase,
): LineWorkflowRateLimiter {
  return {
    async consume(category, principal, now) {
      if (!principal || principal.length > 128) throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
      const store = database ?? getPrisma();
      const { startsAt, expiresAt } = rateLimitWindow(now);
      const keyHash = hashRateLimitKey(category, principal);
      const limit = LINE_WORKFLOW_RATE_LIMITS[category];

      try {
        await store.$executeRaw`DELETE FROM "LineWorkflowRateLimitBucket"
          WHERE ctid IN (
            SELECT ctid FROM "LineWorkflowRateLimitBucket"
            WHERE "expiresAt" <= ${now}
            ORDER BY "expiresAt" ASC
            LIMIT ${CLEANUP_BATCH_SIZE}
            FOR UPDATE SKIP LOCKED
          )`;
        const rows = await store.$queryRaw<Array<{ hitCount: number }>>`INSERT INTO "LineWorkflowRateLimitBucket"
          ("category", "keyHash", "windowStart", "expiresAt", "hitCount")
          VALUES (${category}, ${keyHash}, ${startsAt}, ${expiresAt}, 1)
          ON CONFLICT ("category", "keyHash", "windowStart") DO UPDATE
          SET "hitCount" = LEAST("LineWorkflowRateLimitBucket"."hitCount" + 1, ${limit + 1})
          RETURNING "hitCount"`;
        const hitCount = rows[0]?.hitCount;
        if (typeof hitCount !== "number" || !Number.isSafeInteger(hitCount)) {
          throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
        }
        return hitCount <= limit;
      } catch (error: unknown) {
        if (error instanceof LineWorkflowFailure) throw error;
        throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
      }
    },
  };
}

export const lineWorkflowRateLimitInternals = {
  WINDOW_MS,
  CLEANUP_BATCH_SIZE,
  hashRateLimitKey,
  rateLimitWindow,
};
