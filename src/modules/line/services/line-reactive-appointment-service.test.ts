import { Prisma, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createActorContextStore: vi.fn(),
  resolveActorAccessByUserId: vi.fn(),
  getOwnNextAppointment: vi.fn(),
}));

vi.mock("@/modules/auth/services/actor-context-service", () => ({
  createActorContextStore: mocks.createActorContextStore,
  resolveActorAccessByUserId: mocks.resolveActorAccessByUserId,
}));
vi.mock("@/modules/patient-self/services/patient-self-care-query-service", () => ({
  getOwnNextAppointment: mocks.getOwnNextAppointment,
}));

import { LineFailure } from "../domain/line-errors";
import type { LineReactiveWorkItem } from "../domain/line-reactive-types";
import { LINE_APPOINTMENT_REPLY_COPY } from "../presentation/line-appointment-reply";
import { executeLineReactiveAppointment } from "./line-reactive-appointment-service";

const actor = {
  userId: "demi-user-id",
  personId: "demi-person-id",
  roles: ["PATIENT"],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

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
      },
    });
  });

  it("uses one RepeatableRead transaction and replies only after it closes", async () => {
    const harness = createHarness();
    const replyText = vi.fn(async () => {
      expect(harness.isTransactionActive()).toBe(false);
    });

    const result = await executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      captureAsOf: () => new Date("2026-10-15T02:00:00.000Z"),
      replyText,
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
    expect(replyText).toHaveBeenCalledOnce();
    expect(replyText).toHaveBeenCalledWith(
      "transient-reply-token",
      "นัดหมายถัดไปของคุณ\nวันที่ 15 ตุลาคม 2569 เวลา 09:00 น.\nโรงพยาบาล โรงพยาบาลตัวอย่าง",
    );
  });

  it("refuses when there is no unique current ACTIVE binding", async () => {
    const harness = createHarness([]);
    const replyText = vi.fn().mockResolvedValue(undefined);

    await expect(executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyText,
    })).resolves.toBe("REFUSED_INELIGIBLE");
    expect(mocks.resolveActorAccessByUserId).not.toHaveBeenCalled();
    expect(mocks.getOwnNextAppointment).not.toHaveBeenCalled();
    expect(replyText).toHaveBeenCalledWith(
      "transient-reply-token",
      LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE,
    );
  });

  it("fails closed for conflicting active binding rows", async () => {
    const harness = createHarness([
      { userId: "demi-user-id" },
      { userId: "another-user-id" },
    ]);
    const replyText = vi.fn().mockResolvedValue(undefined);

    await executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyText,
    });

    expect(mocks.resolveActorAccessByUserId).not.toHaveBeenCalled();
    expect(mocks.getOwnNextAppointment).not.toHaveBeenCalled();
    expect(replyText).toHaveBeenCalledWith(
      "transient-reply-token",
      LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE,
    );
  });

  it("does not query or reply when the local execution deadline has passed", async () => {
    const harness = createHarness();
    const replyText = vi.fn();

    await expect(executeLineReactiveAppointment(workItem(1_000), {
      database: harness.database,
      monotonicNow: () => 1_000,
      replyText,
    })).resolves.toBe("EXPIRED_BEFORE_QUERY");

    expect(harness.database.$transaction).not.toHaveBeenCalled();
    expect(replyText).not.toHaveBeenCalled();
  });

  it("discards a query result if the deadline expires while the transaction runs", async () => {
    const harness = createHarness();
    const monotonicNow = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(45_000);
    const replyText = vi.fn();

    await expect(executeLineReactiveAppointment(workItem(45_000), {
      database: harness.database,
      monotonicNow,
      replyText,
    })).resolves.toBe("EXPIRED_BEFORE_REPLY");

    expect(harness.database.$transaction).toHaveBeenCalledOnce();
    expect(mocks.getOwnNextAppointment).toHaveBeenCalledOnce();
    expect(replyText).not.toHaveBeenCalled();
  });

  it("does not compare provider event time or lastLinkedAt to current authority", async () => {
    const harness = createHarness();
    const replyText = vi.fn().mockResolvedValue(undefined);

    await executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 0,
      replyText,
    });

    expect(harness.transaction.lineAccountBinding.findMany).toHaveBeenCalledWith({
      where: { lineUserId: workItem().lineUserId, unlinkedAt: null },
      select: { userId: true },
    });
  });

  it("sends infrastructure copy on transaction failure and makes one Reply attempt", async () => {
    const database = {
      $transaction: vi.fn().mockRejectedValue(new Error("private database error")),
    } as unknown as PrismaClient;
    const replyText = vi.fn().mockResolvedValue(undefined);

    await expect(executeLineReactiveAppointment(workItem(), {
      database,
      monotonicNow: () => 0,
      replyText,
    })).resolves.toBe("INFRASTRUCTURE_FAILURE");
    expect(replyText).toHaveBeenCalledOnce();
    expect(replyText).toHaveBeenCalledWith(
      "transient-reply-token",
      LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE,
    );
  });

  it("does not send a second message after a failed data Reply", async () => {
    const harness = createHarness();
    const replyText = vi.fn().mockRejectedValue(new LineFailure("LINE_PROVIDER_PERMANENT"));

    await expect(executeLineReactiveAppointment(workItem(), {
      database: harness.database,
      monotonicNow: () => 0,
      replyText,
    })).resolves.toBe("LINE_PROVIDER_PERMANENT");
    expect(replyText).toHaveBeenCalledOnce();
  });
});
