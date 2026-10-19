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

import { LineMessagingClient, type LineReplyMessage } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import type {
  LineReactiveMonotonicClock,
  LineReactiveOperationalOutcome,
  LineReactiveWorkItem,
} from "../domain/line-reactive-types";
import type { OperationalLineRole } from "../domain/line-types";
import {
  formatLineAppointmentReply,
  LINE_APPOINTMENT_REPLY_COPY,
} from "../presentation/line-appointment-reply";
import { buildLineHelpReply } from "../presentation/line-help-reply";
import { resolveEligibleLineRoles } from "./line-eligibility-service";

export type LineReactiveAppointmentDependencies = {
  readonly database?: PrismaClient;
  readonly monotonicNow?: LineReactiveMonotonicClock;
  readonly captureAsOf?: () => Date;
  readonly replyText?: (replyToken: string, text: string) => Promise<void>;
  readonly replyMessages?: (replyToken: string, messages: readonly LineReplyMessage[]) => Promise<void>;
};

type LineReactiveAppointmentRead =
  | PatientSelfNextAppointmentResult
  | { status: "WORKFORCE_HELP"; roles: readonly OperationalLineRole[] };

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

/** A workforce-only account gets its role-aware HELP menu instead of the Patient INELIGIBLE copy. */
async function replyWorkforceHelp(
  workItem: LineReactiveWorkItem,
  roles: readonly OperationalLineRole[],
  dependencies: LineReactiveAppointmentDependencies,
  monotonicNow: LineReactiveMonotonicClock,
): Promise<LineReactiveOperationalOutcome> {
  let message: LineReplyMessage;
  let built = true;
  try {
    message = buildLineHelpReply(roles);
  } catch {
    built = false;
    message = buildLineHelpReply("INFRASTRUCTURE_FAILURE");
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
  return built ? "COMPLETED_HELP" : "INFRASTRUCTURE_FAILURE";
}

export async function executeLineReactiveAppointment(
  workItem: LineReactiveWorkItem,
  dependencies: LineReactiveAppointmentDependencies = {},
): Promise<LineReactiveOperationalOutcome> {
  const monotonicNow = dependencies.monotonicNow ?? defaultMonotonicNow;
  if (!isLineReactiveWorkItemLocallyEligible(workItem, monotonicNow)) {
    return "EXPIRED_BEFORE_QUERY";
  }

  let read: LineReactiveAppointmentRead | "INFRASTRUCTURE_FAILURE";
  try {
    read = await (dependencies.database ?? getPrisma()).$transaction(
      async (transaction): Promise<LineReactiveAppointmentRead> => {
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
        const patientResult: PatientSelfNextAppointmentResult = actorAccess.status === "AUTHORIZED"
          ? await getOwnNextAppointment(
              actorAccess.actor,
              dependencies.captureAsOf ?? (() => new Date()),
              { database: transaction },
            )
          : { status: "INELIGIBLE" };
        if (patientResult.status !== "INELIGIBLE") {
          return patientResult;
        }

        // Same eligibility as HELP and the Rich Menu; an account with no eligible role keeps the INELIGIBLE copy.
        const roles = await resolveEligibleLineRoles(bindings[0].userId, transaction);
        return roles.length > 0 && !roles.includes("PATIENT")
          ? { status: "WORKFORCE_HELP", roles }
          : patientResult;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2_000,
        timeout: 5_000,
      },
    );
  } catch {
    read = "INFRASTRUCTURE_FAILURE";
  }
  if (read !== "INFRASTRUCTURE_FAILURE" && read.status === "WORKFORCE_HELP") {
    return replyWorkforceHelp(workItem, read.roles, dependencies, monotonicNow);
  }

  const replyInput: LineReactiveReplyInput = read === "INFRASTRUCTURE_FAILURE"
    ? read
    : replyInputFromPatientResult(read);

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
