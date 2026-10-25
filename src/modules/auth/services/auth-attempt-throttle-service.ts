import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env/server";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { InfrastructureError } from "@/shared/errors/application-error";

export const AUTH_ATTEMPT_THROTTLE = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
  cleanupBatchSize: 100,
} as const;

export type AuthAttemptScope = "PASSWORD_LOGIN" | "PASSWORD_CHANGE" | "RECOVERY_IDENTITY";
export type AuthAttemptInput = {
  scope: AuthAttemptScope;
  identityHash: string;
  clientIp: string | null;
  now: Date;
};

export type AuthAttemptThrottle = {
  isBlocked(input: AuthAttemptInput): Promise<boolean>;
  recordFailure(input: AuthAttemptInput): Promise<void>;
};

type ThrottleKey = { keyHash: string; dimension: "IDENTITY" | "IP" };

function createThrottleKeys(input: AuthAttemptInput, secret: string): ThrottleKey[] {
  if (!/^[a-f0-9]{64}$/iu.test(input.identityHash)) {
    throw new InfrastructureError("Authentication attempt throttle identity is invalid");
  }
  const principals: { dimension: "IDENTITY" | "IP"; value: string }[] = [
    { dimension: "IDENTITY", value: input.identityHash },
  ];
  if (input.clientIp && isIP(input.clientIp)) {
    principals.push({ dimension: "IP", value: input.clientIp });
  }
  return principals.map(({ dimension, value }) => ({
    dimension,
    keyHash: createHmac("sha256", secret)
      .update(`DEMI_AUTH_ATTEMPT_THROTTLE_V1\u0000${input.scope}\u0000${dimension}\u0000${value}`, "utf8")
      .digest("hex"),
  }));
}

function isValidClock(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

/**
 * Counts failed attempts only. Identity and IP principals are separately HMACed, so the bucket table
 * never stores a National ID, an identity hash, or an IP address. The atomic upsert makes the fifth
 * failure start a full 15-minute block across replicas; an active block is not extended by retries.
 */
export function createAuthAttemptThrottle(
  dependencies: {
    database?: PrismaClient;
    secret?: string;
  } = {},
): AuthAttemptThrottle {
  return {
    async isBlocked(input): Promise<boolean> {
      if (!isValidClock(input.now)) throw new InfrastructureError("Authentication throttle clock is invalid");
      const database = dependencies.database ?? getPrisma();
      const keys = createThrottleKeys(input, dependencies.secret ?? getServerEnv().IDENTITY_HASH_SECRET);
      try {
        const rows = await database.authenticationAttemptThrottleBucket.findMany({
          where: { keyHash: { in: keys.map(({ keyHash }) => keyHash) }, blockedUntil: { gt: input.now } },
          select: { keyHash: true },
        });
        return rows.length > 0;
      } catch {
        throw new InfrastructureError("Authentication attempt throttle is unavailable");
      }
    },

    async recordFailure(input): Promise<void> {
      if (!isValidClock(input.now)) throw new InfrastructureError("Authentication throttle clock is invalid");
      const database = dependencies.database ?? getPrisma();
      const secret = dependencies.secret ?? getServerEnv().IDENTITY_HASH_SECRET;
      const keys = createThrottleKeys(input, secret);
      const windowExpiresAt = new Date(input.now.getTime() + AUTH_ATTEMPT_THROTTLE.windowMs);
      const blockExpiresAt = new Date(input.now.getTime() + AUTH_ATTEMPT_THROTTLE.blockMs);

      try {
        await database.$transaction(async (transaction) => {
          await transaction.$executeRaw`DELETE FROM "AuthenticationAttemptThrottleBucket"
            WHERE ctid IN (
              SELECT ctid FROM "AuthenticationAttemptThrottleBucket"
              WHERE "expiresAt" <= ${input.now}
              ORDER BY "expiresAt" ASC
              LIMIT ${AUTH_ATTEMPT_THROTTLE.cleanupBatchSize}
              FOR UPDATE SKIP LOCKED
            )`;

          for (const key of keys) {
            const rows = await transaction.$queryRaw<Array<{ failureCount: number; blockedUntil: Date | null }>>`
              INSERT INTO "AuthenticationAttemptThrottleBucket"
                ("keyHash", "failureCount", "windowStartedAt", "blockedUntil", "expiresAt", "updatedAt")
              VALUES (${key.keyHash}, 1, ${input.now}, NULL, ${windowExpiresAt}, ${input.now})
              ON CONFLICT ("keyHash") DO UPDATE SET
                "failureCount" = CASE
                  WHEN "AuthenticationAttemptThrottleBucket"."expiresAt" <= EXCLUDED."updatedAt" THEN 1
                  ELSE LEAST("AuthenticationAttemptThrottleBucket"."failureCount" + 1, ${AUTH_ATTEMPT_THROTTLE.maxFailures})
                END,
                "windowStartedAt" = CASE
                  WHEN "AuthenticationAttemptThrottleBucket"."expiresAt" <= EXCLUDED."updatedAt" THEN EXCLUDED."windowStartedAt"
                  ELSE "AuthenticationAttemptThrottleBucket"."windowStartedAt"
                END,
                "blockedUntil" = CASE
                  WHEN "AuthenticationAttemptThrottleBucket"."expiresAt" <= EXCLUDED."updatedAt" THEN NULL
                  WHEN "AuthenticationAttemptThrottleBucket"."failureCount" + 1 >= ${AUTH_ATTEMPT_THROTTLE.maxFailures} THEN ${blockExpiresAt}
                  ELSE NULL
                END,
                "expiresAt" = CASE
                  WHEN "AuthenticationAttemptThrottleBucket"."expiresAt" <= EXCLUDED."updatedAt" THEN EXCLUDED."expiresAt"
                  WHEN "AuthenticationAttemptThrottleBucket"."failureCount" + 1 >= ${AUTH_ATTEMPT_THROTTLE.maxFailures} THEN ${blockExpiresAt}
                  ELSE "AuthenticationAttemptThrottleBucket"."expiresAt"
                END,
                "updatedAt" = EXCLUDED."updatedAt"
              WHERE "AuthenticationAttemptThrottleBucket"."blockedUntil" IS NULL
                OR "AuthenticationAttemptThrottleBucket"."blockedUntil" <= EXCLUDED."updatedAt"
              RETURNING "failureCount", "blockedUntil"`;
            const bucket = rows[0];
            if (bucket?.failureCount === AUTH_ATTEMPT_THROTTLE.maxFailures && bucket.blockedUntil) {
              await recordAuditEvent({
                actorUserId: null,
                action: `auth.${input.scope.toLowerCase()}.throttled`,
                resourceType: "AuthenticationAttempt",
                metadata: { dimension: key.dimension, outcome: "BLOCKED" },
              }, transaction);
            }
          }
        });
      } catch (error: unknown) {
        if (error instanceof InfrastructureError) throw error;
        throw new InfrastructureError("Authentication attempt throttle is unavailable");
      }
    },
  };
}

export const authAttemptThrottleInternals = {
  createThrottleKeys,
  isValidClock,
};
