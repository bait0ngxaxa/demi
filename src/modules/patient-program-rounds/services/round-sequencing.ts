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
 * (`lockActivePatientProgram`). Round n accepts writes only while it is opened (ADR-0022), not completed
 * and round n-1 is completed.
 */
export async function assertRoundWritable(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  roundNumber: number,
): Promise<void> {
  const completed = await completedRounds(transaction, patientProgramId);

  if (isRoundOpenForWrites(completed, roundNumber)) {
    const opened = await transaction.patientProgramRound.findUnique({
      where: { patientProgramId_roundNumber: { patientProgramId, roundNumber } },
      select: { id: true },
    });

    if (opened) {
      return;
    }

    throw new RoundConflictError(`ครั้งที่ ${roundNumber} ยังไม่ได้เปิดบริการ`);
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

/** FR-D5: derive the only opened, unfinished round; callers never choose a follow-up round. */
export async function currentOpenRound(transaction: Prisma.TransactionClient, patientProgramId: string): Promise<number> {
  const completed = await completedRounds(transaction, patientProgramId);
  const opened = await transaction.patientProgramRound.findMany({ where: { patientProgramId }, select: { roundNumber: true }, orderBy: { roundNumber: "asc" } });
  const open = opened.filter((round) => !completed.has(round.roundNumber));
  if (open.length !== 1) throw new RoundConflictError("ไม่มีครั้งบริการที่เปิดอยู่");
  await assertRoundWritable(transaction, patientProgramId, open[0].roundNumber);
  return open[0].roundNumber;
}

/** Final Assessment follows at least six opened rounds, all completed. */
export async function assertRoundsFinished(transaction: Prisma.TransactionClient, patientProgramId: string, subject: string): Promise<void> {
  const completed = await completedRounds(transaction, patientProgramId);
  const opened = await transaction.patientProgramRound.findMany({ where: { patientProgramId }, select: { roundNumber: true } });
  if (opened.length < LAST_FOLLOWUP_ROUND || opened.some((round) => !completed.has(round.roundNumber))) {
    throw new RoundConflictError(`ต้องจบบริการทุกครั้งที่เปิดไว้ (อย่างน้อย 6 ครั้ง) ก่อนบันทึก${subject}`);
  }
}

export async function assertFollowupRoundWritable(transaction: Prisma.TransactionClient, patientProgramId: string, programRoundNumber: number): Promise<void> {
  if (programRoundNumber < 3 || await currentOpenRound(transaction, patientProgramId) !== programRoundNumber) {
    throw new RoundConflictError("บันทึกติดตามผลได้เฉพาะครั้งบริการปัจจุบัน ตั้งแต่ครั้งที่ 3");
  }
  const planned = await transaction.patientProgramRoundPlanItem.findFirst({ where: { patientProgramId, roundNumber: programRoundNumber, removedAt: null, stepCode: { in: ["VITALS", "HEALTH_PLAN_REVIEW"] } }, select: { id: true } });
  if (!planned) throw new RoundConflictError("แผนครั้งนี้ไม่มีสัญญาณชีพหรือทบทวนแผนสุขภาพ");
}
