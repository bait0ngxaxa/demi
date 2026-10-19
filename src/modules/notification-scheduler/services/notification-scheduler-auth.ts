import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const secretSchema = z.string().min(32).max(1024);

/**
 * DEMI_SCHEDULER_SECRET wins whenever it is set, even if invalid (fail closed);
 * CRON_SECRET is used only when it is unset. Null means no usable secret.
 */
export function resolveNotificationSchedulerSecret(): string | null {
  const dedicated = process.env.DEMI_SCHEDULER_SECRET;
  const configured = dedicated !== undefined && dedicated.trim() !== "" ? dedicated : process.env.CRON_SECRET;
  const parsed = secretSchema.safeParse(configured);
  return parsed.success ? parsed.data : null;
}

/** Exact `Bearer <secret>` match, compared in constant time over fixed-length digests. */
export function isAuthorizedNotificationSchedulerRequest(authorization: string | null): boolean {
  const secret = resolveNotificationSchedulerSecret();
  if (secret === null || authorization === null) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`, "utf8").digest();
  const provided = createHash("sha256").update(authorization, "utf8").digest();
  return timingSafeEqual(expected, provided);
}
