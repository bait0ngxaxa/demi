import "server-only";

import type { PrismaClient } from "@prisma/client";
import { verifyLineFriendship, verifyLineIdToken } from "../adapters/line-login-client";
import { LineMessagingClient } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import { getLineAccountSummary, refreshLineAccountReachability } from "./line-account-service";
import { reconcileLineBinding } from "./line-menu-reconciler";
import { getCurrentLineSession, type CurrentLineSession } from "./line-session-service";
import { createLineWorkflowRateLimiter, getLineWorkflowRateLimitRetryAfter, type LineWorkflowRateLimiter } from "./line-workflow-rate-limit";

export const LINE_ACCOUNT_STATUS_PROVIDER_BUDGET_MS = 12_000;

export class LineAccountStatusRateLimited extends Error {
  constructor(readonly retryAfter: number) {
    super("ตรวจสอบสถานะบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่");
    this.name = "LineAccountStatusRateLimited";
  }
}

type StatusDependencies = {
  database?: PrismaClient;
  currentSession?: () => Promise<CurrentLineSession>;
  rateLimiter?: LineWorkflowRateLimiter;
  now?: () => Date;
  fetcher?: typeof fetch;
  /** Server-owned deadline; never derived from submitted credentials. */
  signal?: AbortSignal;
};

/** One authenticated, quota-controlled attempt. A shared fetch deadline bounds
 * ALL LINE calls, including verification and read-back, not each call separately.
 * Await the reconciler's normal timeout persistence/finally lease release: no
 * raced writes, detached work, or CHECKED on an exhausted budget.
 */
export async function checkOwnLineAccountStatus(
  input: { idToken: string; accessToken: string },
  dependencies: StatusDependencies = {},
): Promise<Awaited<ReturnType<typeof getLineAccountSummary>> & { reconciliation: "CHECKED" | "PENDING" }> {
  const signal = dependencies.signal ?? AbortSignal.timeout(LINE_ACCOUNT_STATUS_PROVIDER_BUDGET_MS);
  const session = await (dependencies.currentSession ?? getCurrentLineSession)();
  const now = dependencies.now?.() ?? new Date();
  const limiter = dependencies.rateLimiter ?? createLineWorkflowRateLimiter(dependencies.database);
  if (!await limiter.consume("ACCOUNT_STATUS_USER", session.userId, now) ||
      !await limiter.consume("ACCOUNT_STATUS_GLOBAL", "GLOBAL", now)) {
    throw new LineAccountStatusRateLimited(getLineWorkflowRateLimitRetryAfter(now));
  }

  const fetcher: typeof fetch = (url, init) => {
    signal.throwIfAborted();
    return (dependencies.fetcher ?? fetch)(url, {
      ...init,
      signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
    });
  };
  // Reuse the verified request session, not a client-selected principal. The
  // existing services still recheck ACTIVE status, binding ownership/version.
  const accountDependencies = {
    database: dependencies.database,
    currentSession: async (): Promise<CurrentLineSession> => session,
    verifyIdentity: (token: string) => verifyLineIdToken(token, fetcher),
    verifyFriendship: (token: string, subject: string) => verifyLineFriendship(token, subject, fetcher),
  };
  signal.throwIfAborted();
  const refreshed = await refreshLineAccountReachability(input, accountDependencies);
  signal.throwIfAborted();
  const outcome = await reconcileLineBinding(refreshed.bindingId, {
    database: dependencies.database,
    provider: new LineMessagingClient(fetcher),
  });
  signal.throwIfAborted();
  const summary = await getLineAccountSummary(accountDependencies);
  signal.throwIfAborted();
  if (outcome === "RECONCILED" && summary.menuState === "UNAVAILABLE") throw new LineFailure("LINE_PROVIDER_TRANSIENT");
  return { ...summary, reconciliation: outcome === "RECONCILED" ? "CHECKED" : "PENDING" };
}
