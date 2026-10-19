import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";

import { getPrisma } from "@/lib/db/prisma";

import { LineMessagingClient, type LineReplyMessage } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import type {
  LineHelpWorkItem,
  LineReactiveMonotonicClock,
  LineReactiveOperationalOutcome,
} from "../domain/line-reactive-types";
import type { OperationalLineRole } from "../domain/line-types";
import { buildLineHelpReply, type LineHelpReplyInput } from "../presentation/line-help-reply";
import { resolveEligibleLineRoles } from "./line-eligibility-service";
import { createLineHelpReplyThrottle, type LineHelpReplyThrottle } from "./line-help-reply-throttle";
import { isLineReactiveWorkItemLocallyEligible } from "./line-reactive-appointment-service";

export type LineReactiveHelpDependencies = {
  readonly database?: PrismaClient;
  readonly monotonicNow?: LineReactiveMonotonicClock;
  readonly now?: () => Date;
  readonly consumeThrottle?: LineHelpReplyThrottle;
  readonly replyMessages?: (replyToken: string, messages: readonly LineReplyMessage[]) => Promise<void>;
};

const defaultMonotonicNow: LineReactiveMonotonicClock = () => performance.now();
const defaultMessagingClient = new LineMessagingClient();

function safeProviderOutcome(error: unknown): LineReactiveOperationalOutcome {
  if (error instanceof LineFailure && error.code === "LINE_PROVIDER_PERMANENT") {
    return "LINE_PROVIDER_PERMANENT";
  }
  return "LINE_PROVIDER_TRANSIENT";
}

/**
 * HELP reply: resolves the exact active binding's currently eligible roles and
 * replies with fixed navigation quick replies only. The links grant nothing;
 * every destination re-authorizes on the server.
 */
export async function executeLineReactiveHelp(
  workItem: LineHelpWorkItem,
  dependencies: LineReactiveHelpDependencies = {},
): Promise<LineReactiveOperationalOutcome> {
  const monotonicNow = dependencies.monotonicNow ?? defaultMonotonicNow;
  if (!isLineReactiveWorkItemLocallyEligible(workItem, monotonicNow)) {
    return "EXPIRED_BEFORE_QUERY";
  }
  const database = dependencies.database ?? getPrisma();

  if (workItem.throttled) {
    let claimed: boolean;
    try {
      claimed = await (dependencies.consumeThrottle ?? createLineHelpReplyThrottle(database))(
        workItem.lineUserId,
        (dependencies.now ?? (() => new Date()))(),
      );
    } catch {
      // Unsolicited text fails closed: no reply when the throttle is unavailable.
      return "INFRASTRUCTURE_FAILURE";
    }
    if (!claimed) return "THROTTLED";
  }

  let replyInput: LineHelpReplyInput;
  try {
    replyInput = await database.$transaction(
      async (transaction): Promise<readonly OperationalLineRole[]> => {
        const bindings = await transaction.lineAccountBinding.findMany({
          where: { lineUserId: workItem.lineUserId, unlinkedAt: null },
          select: { userId: true },
        });
        if (bindings.length !== 1) return [];
        return resolveEligibleLineRoles(bindings[0].userId, transaction);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2_000,
        timeout: 5_000,
      },
    );
  } catch {
    replyInput = "INFRASTRUCTURE_FAILURE";
  }

  let message: LineReplyMessage;
  try {
    message = buildLineHelpReply(replyInput);
  } catch {
    replyInput = "INFRASTRUCTURE_FAILURE";
    message = buildLineHelpReply(replyInput);
  }

  if (!isLineReactiveWorkItemLocallyEligible(workItem, monotonicNow)) {
    return "EXPIRED_BEFORE_REPLY";
  }
  try {
    await (dependencies.replyMessages ?? ((replyToken, messages) =>
      defaultMessagingClient.replyMessages(replyToken, messages)))(workItem.replyToken, [message]);
  } catch (error: unknown) {
    return safeProviderOutcome(error);
  }

  if (replyInput === "INFRASTRUCTURE_FAILURE") return "INFRASTRUCTURE_FAILURE";
  return replyInput.length === 0 ? "REFUSED_INELIGIBLE" : "COMPLETED_HELP";
}
