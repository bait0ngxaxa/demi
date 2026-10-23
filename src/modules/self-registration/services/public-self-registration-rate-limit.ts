import "server-only";

import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env/server";
import { InfrastructureError } from "@/shared/errors/application-error";

const CLEANUP_BATCH_SIZE = 100;
const PURPOSE = "DEMI_PUBLIC_SELF_REGISTRATION_RATE_LIMIT_V1";

export const PUBLIC_SELF_REGISTRATION_RATE_LIMITS = {
  IP: { limit: 10, windowMs: 15 * 60 * 1000 },
  IDENTITY: { limit: 5, windowMs: 24 * 60 * 60 * 1000 },
  INVITATION: { limit: 5, windowMs: 15 * 60 * 1000 },
  GLOBAL: { limit: 1000, windowMs: 60 * 60 * 1000 },
  CG_PATIENT: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  CG_IDENTITY: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
} as const;

export type PublicSelfRegistrationRateLimitCategory = keyof typeof PUBLIC_SELF_REGISTRATION_RATE_LIMITS;
export type PublicSelfRegistrationRateLimiter = {
  consume(category: PublicSelfRegistrationRateLimitCategory, principal: string, now: Date): Promise<boolean>;
};

type RateLimitDatabase = Pick<PrismaClient, "$executeRaw" | "$queryRaw">;

function hashRateLimitKey(category: PublicSelfRegistrationRateLimitCategory, principal: string, secret: string): string {
  return createHmac("sha256", secret).update(`${PURPOSE}:${category}:${principal}`, "utf8").digest("hex");
}

function rateLimitWindow(category: PublicSelfRegistrationRateLimitCategory, now: Date): { startsAt: Date; expiresAt: Date } {
  const timestamp = now.getTime();
  const windowMs = PUBLIC_SELF_REGISTRATION_RATE_LIMITS[category].windowMs;
  if (!Number.isFinite(timestamp)) throw new InfrastructureError("Self-registration rate limit clock is invalid");
  const start = Math.floor(timestamp / windowMs) * windowMs;
  return { startsAt: new Date(start), expiresAt: new Date(start + 2 * windowMs) };
}

/** PostgreSQL stores only HMAC keys; an outage fails closed for public lookups. */
export function createPublicSelfRegistrationRateLimiter(
  database?: RateLimitDatabase,
  secret: string = getServerEnv().IDENTITY_HASH_SECRET,
): PublicSelfRegistrationRateLimiter {
  return {
    async consume(category, principal, now) {
      if (!principal || principal.length > 256 || !secret) {
        throw new InfrastructureError("Self-registration rate limit is unavailable");
      }
      const store = database ?? getPrisma();
      const { startsAt, expiresAt } = rateLimitWindow(category, now);
      const keyHash = hashRateLimitKey(category, principal, secret);
      const limit = PUBLIC_SELF_REGISTRATION_RATE_LIMITS[category].limit;

      try {
        await store.$executeRaw`DELETE FROM "PublicSelfRegistrationRateLimitBucket"
          WHERE ctid IN (
            SELECT ctid FROM "PublicSelfRegistrationRateLimitBucket"
            WHERE "expiresAt" <= ${now}
            ORDER BY "expiresAt" ASC
            LIMIT ${CLEANUP_BATCH_SIZE}
            FOR UPDATE SKIP LOCKED
          )`;
        const rows = await store.$queryRaw<Array<{ hitCount: number }>>`INSERT INTO "PublicSelfRegistrationRateLimitBucket"
          ("category", "keyHash", "windowStart", "expiresAt", "hitCount")
          VALUES (${category}, ${keyHash}, ${startsAt}, ${expiresAt}, 1)
          ON CONFLICT ("category", "keyHash", "windowStart") DO UPDATE
          SET "hitCount" = LEAST("PublicSelfRegistrationRateLimitBucket"."hitCount" + 1, ${limit + 1})
          RETURNING "hitCount"`;
        const hitCount = rows[0]?.hitCount;
        if (typeof hitCount !== "number" || !Number.isSafeInteger(hitCount)) {
          throw new InfrastructureError("Self-registration rate limit is unavailable");
        }
        return hitCount <= limit;
      } catch (error: unknown) {
        if (error instanceof InfrastructureError) throw error;
        throw new InfrastructureError("Self-registration rate limit is unavailable");
      }
    },
  };
}

export const publicSelfRegistrationRateLimitInternals = {
  CLEANUP_BATCH_SIZE,
  hashRateLimitKey,
  rateLimitWindow,
};
