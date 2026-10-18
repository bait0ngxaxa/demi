import "server-only";

/*
 * Local abuse control applied before LINE verification. State is per server
 * instance and in memory only; it bounds provider calls from one process but
 * is not a distributed quota (see Phase LINE-QA.B1 handoff).
 */

const WINDOW_MS = 5 * 60 * 1000;
const PER_USER_LIMIT = 10;
const INSTANCE_LIMIT_PER_WINDOW = 600;
const MAX_TRACKED_USERS = 10_000;

export type LineWorkflowRateLimiter = { consume(userId: string, now: Date): boolean };

export function createLineWorkflowRateLimiter(): LineWorkflowRateLimiter {
  const users = new Map<string, { windowStart: number; count: number }>();
  let instanceWindowStart = 0;
  let instanceCount = 0;

  return {
    consume(userId, now) {
      const time = now.getTime();
      if (time - instanceWindowStart >= WINDOW_MS) {
        instanceWindowStart = time;
        instanceCount = 0;
        for (const [key, entry] of users) {
          if (time - entry.windowStart >= WINDOW_MS) users.delete(key);
        }
      }
      if (instanceCount >= INSTANCE_LIMIT_PER_WINDOW) return false;
      let entry = users.get(userId);
      if (!entry || time - entry.windowStart >= WINDOW_MS) {
        if (!entry && users.size >= MAX_TRACKED_USERS) return false;
        entry = { windowStart: time, count: 0 };
        users.set(userId, entry);
      }
      if (entry.count >= PER_USER_LIMIT) return false;
      entry.count += 1;
      instanceCount += 1;
      return true;
    },
  };
}

export const lineWorkflowRateLimitInternals = { WINDOW_MS, PER_USER_LIMIT, INSTANCE_LIMIT_PER_WINDOW, MAX_TRACKED_USERS };
