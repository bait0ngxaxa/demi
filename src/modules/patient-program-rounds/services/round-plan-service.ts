import "server-only";

import { randomUUID } from "node:crypto";

import type { PatientProgramRoundToolCode, Prisma } from "@prisma/client";

import { InfrastructureError } from "@/shared/errors/application-error";

import { GUIDELINE_ROUND_COUNT, roundActivitySourceFor } from "../domain/round-catalog";
import { RoundConflictError } from "../domain/round-conflict-error";
import { roundGuideline, type RoundStepCode } from "../domain/round-steps";

export type GuidelineRoundOpening = {
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  roundNumber: number;
  openedByUserId: string;
  openedAt: Date;
};

/**
 * ADR-0022: opens guideline round 1-6 inside the caller's transaction and copies the round's guideline into
 * its plan. Program creation opens round 1 and completing round n < 6 opens round n + 1; a round that is
 * already open is left as it is.
 */
export async function openGuidelineRound(
  transaction: Prisma.TransactionClient,
  input: GuidelineRoundOpening,
): Promise<void> {
  if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1 || input.roundNumber > GUIDELINE_ROUND_COUNT) {
    throw new InfrastructureError("Only guideline rounds can be opened from the guideline");
  }

  const existing = await transaction.patientProgramRound.findUnique({
    where: {
      patientProgramId_roundNumber: { patientProgramId: input.patientProgramId, roundNumber: input.roundNumber },
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await transaction.patientProgramRound.create({
    data: {
      patientProgramId: input.patientProgramId,
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      roundNumber: input.roundNumber,
      origin: "GUIDELINE",
      openedAt: input.openedAt,
      openedByUserId: input.openedByUserId,
      submissionNonce: randomUUID(),
      planItems: {
        create: roundGuideline(input.roundNumber).map((definition, index) => ({
          stepCode: definition.code,
          position: index + 1,
          origin: "GUIDELINE",
          createdAt: input.openedAt,
        })),
      },
    },
    select: { id: true },
  });
}

/** A step the active plan lists at most once; CUSTOM items are identified by their plan item id. */
export type SingularRoundStepCode = Exclude<RoundStepCode, "CUSTOM">;

/** The round's active (not removed) plan item for `stepCode`, if its plan lists the step. */
export async function findActivePlanItem(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  roundNumber: number,
  stepCode: SingularRoundStepCode,
): Promise<{ id: string } | null> {
  return transaction.patientProgramRoundPlanItem.findFirst({
    where: { patientProgramId, roundNumber, stepCode, removedAt: null },
    select: { id: true },
  });
}

/** SR-D8 on plans: a step result is accepted only while the round's plan lists the step (DB trigger backstop). */
export async function assertActivePlanItem(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  roundNumber: number,
  stepCode: SingularRoundStepCode,
): Promise<void> {
  if (!(await findActivePlanItem(transaction, patientProgramId, roundNumber, stepCode))) {
    throw new RoundConflictError(`รายการนี้ไม่อยู่ในแผนของครั้งที่ ${roundNumber}`);
  }
}

/** The ledger source of `toolCode` in the round, read from its active plan inside the writing transaction. */
export async function classifyRoundActivity(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  roundNumber: number,
  toolCode: PatientProgramRoundToolCode,
): Promise<"PLANNED" | "EXTRA"> {
  const items = await transaction.patientProgramRoundPlanItem.findMany({
    where: { patientProgramId, roundNumber, removedAt: null },
    select: { stepCode: true },
  });

  return roundActivitySourceFor(roundNumber, toolCode, items.map((item) => item.stepCode));
}
