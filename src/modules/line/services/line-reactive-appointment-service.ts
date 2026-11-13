import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";

import { getPrisma } from "@/lib/db/prisma";
import { isLineFlexMessagesEnabled } from "@/lib/env/server";
import {
  createActorContextStore,
  resolveActorAccessByUserId,
} from "@/modules/auth/services/actor-context-service";
import {
  getOwnNextAppointment,
  type PatientSelfNextAppointmentResult,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import { LineMessagingClient, type LineMessage, type LineReplyMessage } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import type {
  LineReactiveMonotonicClock,
  LineReactiveOperationalOutcome,
  LineReactiveWorkItem,
} from "../domain/line-reactive-types";
import type { OperationalLineRole } from "../domain/line-types";
import {
  formatLineAppointmentReply,
  type LineAppointmentReply,
  type LineAppointmentReplyInput,
} from "../presentation/line-appointment-reply";
import { buildLineHelpReply } from "../presentation/line-help-reply";
import { resolveEligibleLineRoles } from "./line-eligibility-service";
import { buildLineNotificationCard } from "./line-notification-card";

export type LineReactiveAppointmentDependencies = {
  readonly database?: PrismaClient;
  readonly monotonicNow?: LineReactiveMonotonicClock;
  readonly captureAsOf?: () => Date;
  readonly replyMessages?: (replyToken: string, messages: readonly LineMessage[]) => Promise<void>;
  /** Overrides DEMI_LINE_FLEX_MESSAGES_ENABLED (tests). */
  readonly flexMessages?: boolean;
};

type LineReactiveAppointmentRead =
  | PatientSelfNextAppointmentResult
  | { status: "WORKFORCE_HELP"; roles: readonly OperationalLineRole[] };

type LineReactiveReplyInput = LineAppointmentReplyInput;

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

/** Classifies on the formatter's explicit kind; an unusable appointment is already INFRASTRUCTURE_FAILURE. */
export function outcomeForAppointmentReply(reply: LineAppointmentReply): LineReactiveOperationalOutcome {
  switch (reply.kind) {
    case "INELIGIBLE":
      return "REFUSED_INELIGIBLE";
    case "EMPTY":
      return "COMPLETED_EMPTY";
    case "INFRASTRUCTURE_FAILURE":
      return "INFRASTRUCTURE_FAILURE";
    case "APPOINTMENT":
      return "COMPLETED_WITH_APPOINTMENT";
  }
}

/**
 * ADR-0033: a found appointment and an empty result are each one Flex card
 * while Flex is enabled. A reply token is single-use and short-lived and the
 * user asked for this answer, so a card that cannot be built (no Workspace
 * LIFF, contract error) falls back to today's text; this is the one place
 * where that is correct. INELIGIBLE and INFRASTRUCTURE_FAILURE stay text.
 */
function appointmentReplyMessage(reply: LineAppointmentReply, flexMessages: boolean): LineMessage {
  if (!("card" in reply) || !flexMessages) return { type: "text", text: reply.text };
  try {
    return buildLineNotificationCard(reply.card);
  } catch (error: unknown) {
    console.error("line_reactive_appointment_card_fallback", { cause: error instanceof Error ? error.name : "unknown" });
    return { type: "text", text: reply.text };
  }
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

  const reply = formatLineAppointmentReply(replyInput);
  const message = appointmentReplyMessage(reply, dependencies.flexMessages ?? isLineFlexMessagesEnabled());
  if (!isLineReactiveWorkItemLocallyEligible(workItem, monotonicNow)) {
    return "EXPIRED_BEFORE_REPLY";
  }
  try {
    await (dependencies.replyMessages ?? ((replyToken, messages) =>
      defaultMessagingClient.replyMessages(replyToken, messages)))(workItem.replyToken, [message]);
  } catch (error: unknown) {
    return safeProviderOutcome(error);
  }

  return outcomeForAppointmentReply(reply);
}
