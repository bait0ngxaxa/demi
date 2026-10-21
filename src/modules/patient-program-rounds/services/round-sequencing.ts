import "server-only";

import type { Prisma } from "@prisma/client";

import { LAST_FOLLOWUP_ROUND } from "../domain/round-catalog";
import { RoundConflictError } from "../domain/round-conflict-error";
import { isRoundOpenForWrites } from "../domain/round-steps";

async function completedRounds(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
): Promise<Set<number>> {
  const rows = await transaction.patientProgramRoundCompletion.findMany({
    where: { patientProgramId },
    select: { roundNumber: true },
  });

  return new Set(rows.map((row) => row.roundNumber));
}

/**
 * SR-D5: run inside the caller's serializable transaction, after the Program was locked as ACTIVE
 * (`lockActivePatientProgram`). Round n accepts writes only while it is open and round n-1 is completed.
 */
export async function assertRoundWritable(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  roundNumber: number,
): Promise<void> {
  const completed = await completedRounds(transaction, patientProgramId);

  if (isRoundOpenForWrites(completed, roundNumber)) {
    return;
  }

  if (completed.has(roundNumber)) {
    throw new RoundConflictError(
      `ครั้งที่ ${roundNumber} จบบริการแล้ว ข้อมูลของครั้งนี้เป็นแบบอ่านอย่างเดียว`,
    );
  }

  throw new RoundConflictError(
    `ต้องจบบริการครั้งที่ ${roundNumber - 1} ก่อน จึงจะบันทึกครั้งที่ ${roundNumber} ได้`,
  );
}

/** Writes that follow the six rounds (Final Assessment, Follow-ups beyond round 6) need round 6 completed. */
export async function assertRoundsFinished(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  subject: string,
): Promise<void> {
  const completed = await completedRounds(transaction, patientProgramId);

  if (!completed.has(LAST_FOLLOWUP_ROUND)) {
    throw new RoundConflictError(
      `ต้องจบบริการครั้งที่ ${LAST_FOLLOWUP_ROUND} ก่อน จึงจะบันทึก${subject}ได้`,
    );
  }
}

/** Follow-up k belongs to round k + 2; Follow-ups after round 6 are extra history. */
export async function assertFollowupRoundWritable(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  programRoundNumber: number,
): Promise<void> {
  if (programRoundNumber <= LAST_FOLLOWUP_ROUND) {
    await assertRoundWritable(transaction, patientProgramId, programRoundNumber);
    return;
  }

  await assertRoundsFinished(transaction, patientProgramId, "การติดตามผลเพิ่มเติม");
}
