import { Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveEligibleLineRoles: vi.fn() }));

vi.mock("./line-eligibility-service", () => ({ resolveEligibleLineRoles: mocks.resolveEligibleLineRoles }));

import type { LineReplyMessage } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import type { LineHelpWorkItem } from "../domain/line-reactive-types";
import { LINE_HELP_REPLY_COPY } from "../presentation/line-help-reply";
import { executeLineReactiveHelp } from "./line-reactive-help-service";

const lineUserId = `U${"a".repeat(32)}`;
const now = new Date("2026-10-19T02:00:00.000Z");

function workItem(overrides: Partial<LineHelpWorkItem> = {}): LineHelpWorkItem {
  return {
    intent: "HELP",
    throttled: false,
    webhookEventId: "01ARZ3NDEKTSV4RRFFQ69G5F50",
    eventOccurredAt: new Date("1990-01-01T00:00:00.000Z"),
    localExecutionDeadline: 45_000,
    lineUserId,
    replyToken: "transient-reply-token",
    isRedelivery: false,
    ...overrides,
  };
}

function createHarness(bindingRows: readonly { userId: string }[] = [{ userId: "demi-user-id" }]) {
  let transactionActive = false;
  const transaction = {
    lineAccountBinding: { findMany: vi.fn().mockResolvedValue(bindingRows) },
  } as unknown as Prisma.TransactionClient;
  const database = {
    $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      transactionActive = true;
      try {
        return await operation(transaction);
      } finally {
        transactionActive = false;
      }
    }),
  } as unknown as PrismaClient;
  return { database, transaction, isTransactionActive: () => transactionActive };
}

function sentMessages(replyMessages: ReturnType<typeof vi.fn>): readonly LineReplyMessage[] {
  const call = replyMessages.mock.calls[0];
  if (!call) throw new Error("Expected one reply");
  return call[1] as readonly LineReplyMessage[];
}

describe("LINE reactive HELP execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
    mocks.resolveEligibleLineRoles.mockResolvedValue(["PATIENT"]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads current eligible roles in one RepeatableRead transaction and replies after it closes", async () => {
    const harness = createHarness();
    const replyMessages = vi.fn<(token: string, messages: readonly LineReplyMessage[]) => Promise<void>>(async () => {
      expect(harness.isTransactionActive()).toBe(false);
    });
    const consumeThrottle = vi.fn();

    const result = await executeLineReactiveHelp(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      consumeThrottle,
      replyMessages,
    });

    expect(result).toBe("COMPLETED_HELP");
    expect(consumeThrottle).not.toHaveBeenCalled();
    expect(harness.database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 2_000,
      timeout: 5_000,
    });
    expect(harness.transaction.lineAccountBinding.findMany).toHaveBeenCalledWith({
      where: { lineUserId, unlinkedAt: null },
      select: { userId: true },
    });
    expect(mocks.resolveEligibleLineRoles).toHaveBeenCalledWith("demi-user-id", harness.transaction);
    expect(replyMessages).toHaveBeenCalledOnce();
    expect(replyMessages.mock.calls[0]?.[0]).toBe("transient-reply-token");
    const [message] = sentMessages(replyMessages);
    expect(message?.text).toBe(LINE_HELP_REPLY_COPY.PATIENT);
    expect(message?.quickReply?.items).toHaveLength(5);
  });

  it("claims the throttle for unmatched text and replies once claimed", async () => {
    const harness = createHarness();
    const replyMessages = vi.fn().mockResolvedValue(undefined);
    const consumeThrottle = vi.fn().mockResolvedValue(true);

    await expect(executeLineReactiveHelp(workItem({ throttled: true }), {
      database: harness.database,
      monotonicNow: () => 1_000,
      now: () => now,
      consumeThrottle,
      replyMessages,
    })).resolves.toBe("COMPLETED_HELP");

    expect(consumeThrottle).toHaveBeenCalledWith(lineUserId, now);
    expect(replyMessages).toHaveBeenCalledOnce();
  });

  it("sends nothing and reads nothing when the throttle window is already used", async () => {
    const harness = createHarness();
    const replyMessages = vi.fn();

    await expect(executeLineReactiveHelp(workItem({ throttled: true }), {
      database: harness.database,
      monotonicNow: () => 1_000,
      consumeThrottle: vi.fn().mockResolvedValue(false),
      replyMessages,
    })).resolves.toBe("THROTTLED");

    expect(harness.database.$transaction).not.toHaveBeenCalled();
    expect(replyMessages).not.toHaveBeenCalled();
  });

  it("fails closed with no reply when the throttle store is unavailable", async () => {
    const harness = createHarness();
    const replyMessages = vi.fn();

    await expect(executeLineReactiveHelp(workItem({ throttled: true }), {
      database: harness.database,
      monotonicNow: () => 1_000,
      consumeThrottle: vi.fn().mockRejectedValue(new Error("database unavailable")),
      replyMessages,
    })).resolves.toBe("INFRASTRUCTURE_FAILURE");

    expect(harness.database.$transaction).not.toHaveBeenCalled();
    expect(replyMessages).not.toHaveBeenCalled();
  });

  it.each([
    ["unbound", [], ["PATIENT"]],
    ["multiple bindings", [{ userId: "first" }, { userId: "second" }], ["PATIENT"]],
    ["inactive or roleless account", [{ userId: "demi-user-id" }], []],
  ] as const)("returns the same generic INELIGIBLE reply for an %s LINE user", async (_label, bindings, roles) => {
    const harness = createHarness(bindings);
    mocks.resolveEligibleLineRoles.mockResolvedValue(roles);
    const replyMessages = vi.fn().mockResolvedValue(undefined);

    await expect(executeLineReactiveHelp(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyMessages,
    })).resolves.toBe("REFUSED_INELIGIBLE");

    expect(sentMessages(replyMessages)).toEqual([{
      type: "text",
      text: LINE_HELP_REPLY_COPY.INELIGIBLE,
      quickReply: {
        items: [{
          type: "action",
          action: { type: "uri", label: "จัดการบัญชี DEMI", uri: "https://liff.line.me/1234567890-AbCdEfGh" },
        }],
      },
    }]);
    if (bindings.length !== 1) expect(mocks.resolveEligibleLineRoles).not.toHaveBeenCalled();
  });

  it("replies with the plain failure copy when the role read fails", async () => {
    const harness = createHarness();
    vi.mocked(harness.database.$transaction).mockRejectedValueOnce(new Error("private database detail"));
    const replyMessages = vi.fn().mockResolvedValue(undefined);

    await expect(executeLineReactiveHelp(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyMessages,
    })).resolves.toBe("INFRASTRUCTURE_FAILURE");

    expect(sentMessages(replyMessages)).toEqual([{ type: "text", text: LINE_HELP_REPLY_COPY.INFRASTRUCTURE_FAILURE }]);
  });

  it("replies with the plain failure copy when a quick-reply link cannot be built", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "");
    const harness = createHarness([]);
    const replyMessages = vi.fn().mockResolvedValue(undefined);

    await expect(executeLineReactiveHelp(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyMessages,
    })).resolves.toBe("INFRASTRUCTURE_FAILURE");

    expect(sentMessages(replyMessages)).toEqual([{ type: "text", text: LINE_HELP_REPLY_COPY.INFRASTRUCTURE_FAILURE }]);
  });

  it("does nothing once the local deadline has passed before the query", async () => {
    const harness = createHarness();
    const consumeThrottle = vi.fn();
    const replyMessages = vi.fn();

    await expect(executeLineReactiveHelp(workItem({ throttled: true }), {
      database: harness.database,
      monotonicNow: () => 45_000,
      consumeThrottle,
      replyMessages,
    })).resolves.toBe("EXPIRED_BEFORE_QUERY");

    expect(consumeThrottle).not.toHaveBeenCalled();
    expect(harness.database.$transaction).not.toHaveBeenCalled();
    expect(replyMessages).not.toHaveBeenCalled();
  });

  it("does not reply when the deadline passes during the read", async () => {
    const harness = createHarness();
    const clock = vi.fn().mockReturnValueOnce(1_000).mockReturnValue(45_000);
    const replyMessages = vi.fn();

    await expect(executeLineReactiveHelp(workItem(), {
      database: harness.database,
      monotonicNow: clock,
      replyMessages,
    })).resolves.toBe("EXPIRED_BEFORE_REPLY");

    expect(replyMessages).not.toHaveBeenCalled();
  });

  it.each([
    [new LineFailure("LINE_PROVIDER_PERMANENT"), "LINE_PROVIDER_PERMANENT"],
    [new LineFailure("LINE_PROVIDER_TRANSIENT"), "LINE_PROVIDER_TRANSIENT"],
    [new Error("socket hang up"), "LINE_PROVIDER_TRANSIENT"],
  ] as const)("maps Reply failure %s to a safe provider outcome", async (error, outcome) => {
    const harness = createHarness();

    await expect(executeLineReactiveHelp(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyMessages: vi.fn().mockRejectedValue(error),
    })).resolves.toBe(outcome);
  });
});
