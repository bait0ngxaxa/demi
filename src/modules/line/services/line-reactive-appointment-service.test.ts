import { Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createActorContextStore: vi.fn(),
  resolveActorAccessByUserId: vi.fn(),
  getOwnNextAppointment: vi.fn(),
  resolveEligibleLineRoles: vi.fn(),
}));

vi.mock("@/modules/auth/services/actor-context-service", () => ({
  createActorContextStore: mocks.createActorContextStore,
  resolveActorAccessByUserId: mocks.resolveActorAccessByUserId,
}));
vi.mock("@/modules/patient-self/services/patient-self-care-query-service", () => ({
  getOwnNextAppointment: mocks.getOwnNextAppointment,
}));
vi.mock("./line-eligibility-service", () => ({
  resolveEligibleLineRoles: mocks.resolveEligibleLineRoles,
}));

import type { LineMessage } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import type { LineReactiveWorkItem } from "../domain/line-reactive-types";
import { formatLineAppointmentReply, LINE_APPOINTMENT_REPLY_COPY } from "../presentation/line-appointment-reply";
import { LINE_HELP_REPLY_COPY } from "../presentation/line-help-reply";
import { executeLineReactiveAppointment, outcomeForAppointmentReply } from "./line-reactive-appointment-service";

const actor = {
  userId: "demi-user-id",
  personId: "demi-person-id",
  roles: ["PATIENT"],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const APPOINTMENT_TEXT = "นัดหมายถัดไปของคุณ\nวันที่ 15 ตุลาคม 2569 เวลา 09:00 น.\nโรงพยาบาล โรงพยาบาลตัวอย่าง";

function workItem(localExecutionDeadline = 45_000): LineReactiveWorkItem {
  return {
    intent: "PATIENT_NEXT_APPOINTMENT",
    webhookEventId: "01ARZ3NDEKTSV4RRFFQ69G5F10",
    eventOccurredAt: new Date("1990-01-01T00:00:00.000Z"),
    localExecutionDeadline,
    lineUserId: `U${"a".repeat(32)}`,
    replyToken: "transient-reply-token",
    isRedelivery: false,
  };
}

function createHarness(bindingRows: readonly { userId: string }[] = [{ userId: "demi-user-id" }]) {
  let transactionActive = false;
  const transaction = {
    lineAccountBinding: {
      findMany: vi.fn().mockResolvedValue(bindingRows),
    },
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

function replySpy() {
  return vi.fn<(replyToken: string, messages: readonly LineMessage[]) => Promise<void>>(async () => undefined);
}

function onlyMessage(reply: ReturnType<typeof replySpy>): LineMessage | undefined {
  expect(reply).toHaveBeenCalledOnce();
  const [token, messages] = reply.mock.calls[0] ?? [];
  expect(token).toBe("transient-reply-token");
  expect(messages).toHaveLength(1);
  return messages?.[0];
}

function stubWorkspaceLiff(): void {
  vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
  vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
  vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
  vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID", "1234567890-WorkSpace");
}

describe("LINE reactive Patient appointment execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createActorContextStore.mockReturnValue({ transactionStore: true });
    mocks.resolveActorAccessByUserId.mockResolvedValue({ status: "AUTHORIZED", actor });
    mocks.getOwnNextAppointment.mockResolvedValue({
      status: "AUTHORIZED",
      appointment: {
        scheduledAt: new Date("2026-10-15T02:00:00.000Z"),
        hospitalName: "โรงพยาบาลตัวอย่าง",
        type: "FOLLOW_UP",
        locationType: "CLINIC",
      },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses one RepeatableRead transaction and replies only after it closes", async () => {
    const harness = createHarness();
    const replyMessages = vi.fn<(replyToken: string, messages: readonly LineMessage[]) => Promise<void>>(async () => {
      expect(harness.isTransactionActive()).toBe(false);
    });

    const result = await executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      captureAsOf: () => new Date("2026-10-15T02:00:00.000Z"),
      flexMessages: false,
      replyMessages,
    });

    expect(result).toBe("COMPLETED_WITH_APPOINTMENT");
    expect(harness.database.$transaction).toHaveBeenCalledOnce();
    expect(harness.database.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2_000,
        timeout: 5_000,
      },
    );
    expect(harness.transaction.lineAccountBinding.findMany).toHaveBeenCalledWith({
      where: { lineUserId: workItem().lineUserId, unlinkedAt: null },
      select: { userId: true },
    });
    expect(mocks.createActorContextStore).toHaveBeenCalledOnce();
    expect(mocks.createActorContextStore).toHaveBeenCalledWith(harness.transaction);
    expect(mocks.resolveActorAccessByUserId).toHaveBeenCalledOnce();
    expect(mocks.resolveActorAccessByUserId).toHaveBeenCalledWith(
      "demi-user-id",
      { transactionStore: true },
    );
    expect(mocks.getOwnNextAppointment).toHaveBeenCalledOnce();
    expect(mocks.getOwnNextAppointment).toHaveBeenCalledWith(
      actor,
      expect.any(Function),
      { database: harness.transaction },
    );
    expect(onlyMessage(replyMessages)).toEqual({ type: "text", text: APPOINTMENT_TEXT });
  });

  it("ADR-0033: replies with one card opening all appointments while Flex is enabled", async () => {
    stubWorkspaceLiff();
    const harness = createHarness();
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 0,
      flexMessages: true,
      replyMessages,
    })).resolves.toBe("COMPLETED_WITH_APPOINTMENT");

    const message = onlyMessage(replyMessages);
    if (message?.type !== "flex") throw new Error("Expected a Flex reply");
    expect(message.altText).toBe("นัดหมายถัดไปของคุณ: ติดตาม 15 ต.ค. 2569");
    expect(message.contents.footer?.contents[0]).toMatchObject({
      type: "button",
      action: { type: "uri", label: "ดูนัดหมายทั้งหมด", uri: "https://liff.line.me/1234567890-WorkSpace/app/personal/appointments" },
    });
    expect(JSON.stringify(message)).not.toContain("demi.example.org");
  });

  it("ADR-0033: falls back to today's text when the card cannot be built, and logs by name only", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID", "");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const harness = createHarness();
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 0,
      flexMessages: true,
      replyMessages,
    })).resolves.toBe("COMPLETED_WITH_APPOINTMENT");

    expect(onlyMessage(replyMessages)).toEqual({ type: "text", text: APPOINTMENT_TEXT });
    expect(errors).toHaveBeenCalledWith("line_reactive_appointment_card_fallback", { cause: "LineFailure" });
    expect(JSON.stringify(errors.mock.calls)).not.toContain("โรงพยาบาลตัวอย่าง");
    errors.mockRestore();
  });

  it.each([true, false])("keeps EMPTY as plain text with Flex %s", async (flexMessages) => {
    stubWorkspaceLiff();
    mocks.getOwnNextAppointment.mockResolvedValue({ status: "AUTHORIZED", appointment: null });
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(), {
      database: createHarness().database,
      monotonicNow: () => 0,
      flexMessages,
      replyMessages,
    })).resolves.toBe("COMPLETED_EMPTY");
    expect(onlyMessage(replyMessages)).toEqual({ type: "text", text: LINE_APPOINTMENT_REPLY_COPY.EMPTY });
  });

  it.each([true, false])("keeps INELIGIBLE as plain text with Flex %s", async (flexMessages) => {
    stubWorkspaceLiff();
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(), {
      database: createHarness([]).database,
      monotonicNow: () => 1_000,
      flexMessages,
      replyMessages,
    })).resolves.toBe("REFUSED_INELIGIBLE");
    expect(mocks.resolveActorAccessByUserId).not.toHaveBeenCalled();
    expect(mocks.getOwnNextAppointment).not.toHaveBeenCalled();
    expect(onlyMessage(replyMessages)).toEqual({ type: "text", text: LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE });
  });

  it.each([true, false])("sends infrastructure copy as plain text on transaction failure with Flex %s", async (flexMessages) => {
    stubWorkspaceLiff();
    const database = {
      $transaction: vi.fn().mockRejectedValue(new Error("private database error")),
    } as unknown as PrismaClient;
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(), {
      database,
      monotonicNow: () => 0,
      flexMessages,
      replyMessages,
    })).resolves.toBe("INFRASTRUCTURE_FAILURE");
    expect(onlyMessage(replyMessages)).toEqual({ type: "text", text: LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE });
  });

  it("classifies an unusable appointment as INFRASTRUCTURE_FAILURE from its kind, flag on", async () => {
    stubWorkspaceLiff();
    mocks.getOwnNextAppointment.mockResolvedValue({
      status: "AUTHORIZED",
      appointment: { scheduledAt: new Date(Number.NaN), hospitalName: "โรงพยาบาลตัวอย่าง", type: "FOLLOW_UP", locationType: null },
    });
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(), {
      database: createHarness().database,
      monotonicNow: () => 0,
      flexMessages: true,
      replyMessages,
    })).resolves.toBe("INFRASTRUCTURE_FAILURE");
    expect(onlyMessage(replyMessages)).toEqual({ type: "text", text: LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE });
  });

  it("maps every reply kind to its outcome", () => {
    expect(outcomeForAppointmentReply(formatLineAppointmentReply("INELIGIBLE"))).toBe("REFUSED_INELIGIBLE");
    expect(outcomeForAppointmentReply(formatLineAppointmentReply("EMPTY"))).toBe("COMPLETED_EMPTY");
    expect(outcomeForAppointmentReply(formatLineAppointmentReply("INFRASTRUCTURE_FAILURE"))).toBe("INFRASTRUCTURE_FAILURE");
    expect(outcomeForAppointmentReply(formatLineAppointmentReply({
      scheduledAt: new Date("2026-10-15T02:00:00.000Z"), hospitalName: "โรงพยาบาล", type: "ASSESSMENT", locationType: null,
    }))).toBe("COMPLETED_WITH_APPOINTMENT");
  });

  it("fails closed for conflicting active binding rows", async () => {
    const harness = createHarness([
      { userId: "demi-user-id" },
      { userId: "another-user-id" },
    ]);
    const replyMessages = replySpy();

    await executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyMessages,
    });

    expect(mocks.resolveActorAccessByUserId).not.toHaveBeenCalled();
    expect(mocks.getOwnNextAppointment).not.toHaveBeenCalled();
    expect(onlyMessage(replyMessages)).toEqual({ type: "text", text: LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE });
  });

  it("does not query or reply when the local execution deadline has passed", async () => {
    const harness = createHarness();
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(1_000), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyMessages,
    })).resolves.toBe("EXPIRED_BEFORE_QUERY");

    expect(harness.database.$transaction).not.toHaveBeenCalled();
    expect(replyMessages).not.toHaveBeenCalled();
  });

  it.each([true, false])("discards a query result if the deadline expires while the transaction runs (Flex %s)", async (flexMessages) => {
    stubWorkspaceLiff();
    const harness = createHarness();
    const monotonicNow = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(45_000);
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(45_000), {
      database: harness.database,
      monotonicNow,
      flexMessages,
      replyMessages,
    })).resolves.toBe("EXPIRED_BEFORE_REPLY");

    expect(harness.database.$transaction).toHaveBeenCalledOnce();
    expect(mocks.getOwnNextAppointment).toHaveBeenCalledOnce();
    expect(replyMessages).not.toHaveBeenCalled();
  });

  it("does not compare provider event time or lastLinkedAt to current authority", async () => {
    const harness = createHarness();

    await executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 0,
      replyMessages: replySpy(),
    });

    expect(harness.transaction.lineAccountBinding.findMany).toHaveBeenCalledWith({
      where: { lineUserId: workItem().lineUserId, unlinkedAt: null },
      select: { userId: true },
    });
  });

  it.each([
    [["OSM"], ["ผู้ป่วยที่ดูแล", "คัดกรองผู้ป่วย", "บันทึกติดตาม"]],
    [["HOSPITAL"], ["งานโรงพยาบาล"]],
    [["OSM", "HOSPITAL"], ["ผู้ป่วยที่ดูแล", "คัดกรองผู้ป่วย", "บันทึกติดตาม", "งานโรงพยาบาล"]],
  ])("replies with the role-aware HELP menu to a workforce-only %j account", async (roles, labels) => {
    stubWorkspaceLiff();
    const harness = createHarness();
    mocks.resolveActorAccessByUserId.mockResolvedValue({ status: "AUTHORIZED", actor: { ...actor, roles } });
    mocks.getOwnNextAppointment.mockResolvedValue({ status: "INELIGIBLE" });
    mocks.resolveEligibleLineRoles.mockResolvedValue(roles);
    const replyMessages = vi.fn<(replyToken: string, messages: readonly LineMessage[]) => Promise<void>>(async () => {
      expect(harness.isTransactionActive()).toBe(false);
    });

    await expect(executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 0,
      flexMessages: true,
      replyMessages,
    })).resolves.toBe("COMPLETED_HELP");

    expect(mocks.resolveEligibleLineRoles).toHaveBeenCalledWith("demi-user-id", harness.transaction);
    const message = onlyMessage(replyMessages);
    if (message?.type !== "text") throw new Error("Expected the HELP text reply");
    expect(message.text).toBe(LINE_HELP_REPLY_COPY.WORKFORCE);
    expect(message.quickReply?.items.map(({ action }) => action.label)).toEqual(labels);
  });

  it.each([
    ["no eligible role", [], { status: "AUTHORIZED", actor }],
    ["an inactive account", [], { status: "ACCOUNT_NOT_ACTIVE", accountStatus: "SUSPENDED" }],
    ["an eligible Patient role", ["PATIENT", "OSM"], { status: "AUTHORIZED", actor }],
  ])("keeps the Patient INELIGIBLE copy for %s", async (_label, roles, access) => {
    const harness = createHarness();
    mocks.resolveActorAccessByUserId.mockResolvedValue(access);
    mocks.getOwnNextAppointment.mockResolvedValue({ status: "INELIGIBLE" });
    mocks.resolveEligibleLineRoles.mockResolvedValue(roles);
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 0,
      replyMessages,
    })).resolves.toBe("REFUSED_INELIGIBLE");
    expect(onlyMessage(replyMessages)).toEqual({ type: "text", text: LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE });
  });

  it("does not resolve workforce roles when the Patient read succeeds", async () => {
    const harness = createHarness();
    await executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 0,
      replyMessages: replySpy(),
    });
    expect(mocks.resolveEligibleLineRoles).not.toHaveBeenCalled();
  });

  it("does not reply with the workforce HELP menu after the deadline passes", async () => {
    const harness = createHarness();
    mocks.getOwnNextAppointment.mockResolvedValue({ status: "INELIGIBLE" });
    mocks.resolveEligibleLineRoles.mockResolvedValue(["OSM"]);
    const monotonicNow = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(45_000);
    const replyMessages = replySpy();

    await expect(executeLineReactiveAppointment(workItem(45_000), {
      database: harness.database,
      monotonicNow,
      replyMessages,
    })).resolves.toBe("EXPIRED_BEFORE_REPLY");
    expect(replyMessages).not.toHaveBeenCalled();
  });

  it.each([
    [new LineFailure("LINE_PROVIDER_PERMANENT"), "LINE_PROVIDER_PERMANENT"],
    [new LineFailure("LINE_PROVIDER_TRANSIENT"), "LINE_PROVIDER_TRANSIENT"],
    [new Error("network"), "LINE_PROVIDER_TRANSIENT"],
  ] as const)("maps a failed Reply without sending a second message (%s)", async (error, outcome) => {
    stubWorkspaceLiff();
    const replyMessages = vi.fn<(replyToken: string, messages: readonly LineMessage[]) => Promise<void>>().mockRejectedValue(error);

    await expect(executeLineReactiveAppointment(workItem(), {
      database: createHarness().database,
      monotonicNow: () => 0,
      flexMessages: true,
      replyMessages,
    })).resolves.toBe(outcome);
    expect(replyMessages).toHaveBeenCalledOnce();
  });
});
