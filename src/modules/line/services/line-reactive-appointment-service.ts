import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";

import { getPrisma } from "@/lib/db/prisma";
import {
  createActorContextStore,
  resolveActorAccessByUserId,
} from "@/modules/auth/services/actor-context-service";
import {
  getOwnNextAppointment,
  type PatientSelfNextAppointmentResult,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import { LineMessagingClient } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import type {
  LineReactiveMonotonicClock,
  LineReactiveOperationalOutcome,
  LineReactiveWorkItem,
} from "../domain/line-reactive-types";
import {
  formatLineAppointmentReply,
  LINE_APPOINTMENT_REPLY_COPY,
} from "../presentation/line-appointment-reply";

export type LineReactiveAppointmentDependencies = {
  readonly database?: PrismaClient;
  readonly monotonicNow?: LineReactiveMonotonicClock;
  readonly captureAsOf?: () => Date;
  readonly replyText?: (replyToken: string, text: string) => Promise<void>;
};

type LineReactiveReplyInput =
  | "INELIGIBLE"
  | "EMPTY"
  | "INFRASTRUCTURE_FAILURE"
  | { scheduledAt: Date; hospitalName: string };

const defaultMonotonicNow: LineReactiveMonotonicClock = () => performance.now();
const defaultMessagingClient = new LineMessagingClient();

export function isLineReactiveWorkItemLocallyEligible(
  workItem: LineReactiveWorkItem,
  monotonicNow: LineReactiveMonotonicClock = defaultMonotonicNow,
): boolean {
  return Number.isFinite(workItem.localExecutionDeadline) &&
    monotonicNow() < workItem.localExecutionDeadline;
}

function replyInputFromPatientResult(
  result: PatientSelfNextAppointmentResult,
): LineReactiveReplyInput {
  if (result.status === "INELIGIBLE") {
    return "INELIGIBLE";
  }

  return result.appointment ?? "EMPTY";
}

function outcomeForReplyInput(
  input: LineReactiveReplyInput,
  replyText: string,
): LineReactiveOperationalOutcome {
  if (input === "INELIGIBLE") {
    return "REFUSED_INELIGIBLE";
  }
  if (input === "EMPTY") {
    return "COMPLETED_EMPTY";
  }
  if (
    input === "INFRASTRUCTURE_FAILURE" ||
    replyText === LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE
  ) {
    return "INFRASTRUCTURE_FAILURE";
  }
  return "COMPLETED_WITH_APPOINTMENT";
}

function safeProviderOutcome(error: unknown): LineReactiveOperationalOutcome {
  if (error instanceof LineFailure && error.code === "LINE_PROVIDER_PERMANENT") {
    return "LINE_PROVIDER_PERMANENT";
  }
  return "LINE_PROVIDER_TRANSIENT";
}

export async function executeLineReactiveAppointment(
  workItem: LineReactiveWorkItem,
  dependencies: LineReactiveAppointmentDependencies = {},
): Promise<LineReactiveOperationalOutcome> {
  const monotonicNow = dependencies.monotonicNow ?? defaultMonotonicNow;
  if (!isLineReactiveWorkItemLocallyEligible(workItem, monotonicNow)) {
    return "EXPIRED_BEFORE_QUERY";
  }

  let replyInput: LineReactiveReplyInput;
  try {
    const result = await (dependencies.database ?? getPrisma()).$transaction(
      async (transaction): Promise<PatientSelfNextAppointmentResult> => {
        const bindings = await transaction.lineAccountBinding.findMany({
          where: {
            lineUserId: workItem.lineUserId,
            unlinkedAt: null,
          },
          select: { userId: true },
        });
        if (bindings.length !== 1) {
          return { status: "INELIGIBLE" };
        }

        const actorAccess = await resolveActorAccessByUserId(
          bindings[0].userId,
          createActorContextStore(transaction),
        );
        if (actorAccess.status !== "AUTHORIZED") {
          return { status: "INELIGIBLE" };
        }

        return getOwnNextAppointment(
          actorAccess.actor,
          dependencies.captureAsOf ?? (() => new Date()),
          { database: transaction },
        );
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2_000,
        timeout: 5_000,
      },
    );
    replyInput = replyInputFromPatientResult(result);
  } catch {
    replyInput = "INFRASTRUCTURE_FAILURE";
  }

  const text = formatLineAppointmentReply(replyInput);
  if (!isLineReactiveWorkItemLocallyEligible(workItem, monotonicNow)) {
    return "EXPIRED_BEFORE_REPLY";
  }
  try {
    await (dependencies.replyText ?? ((replyToken, message) =>
      defaultMessagingClient.replyText(replyToken, message)))(workItem.replyToken, text);
  } catch (error: unknown) {
    return safeProviderOutcome(error);
  }

  return outcomeForReplyInput(replyInput, text);
}
