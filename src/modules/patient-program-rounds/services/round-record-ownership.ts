import "server-only";

import type { Prisma } from "@prisma/client";

import type { ActivePatientProgramMutationContext } from "@/modules/patient-program/services/patient-program-lifecycle-service";

import { isFollowupRound, toFollowupRoundNumber } from "../domain/round-catalog";
import { RoundConflictError } from "../domain/round-conflict-error";
import { followupHoldsVitals } from "../domain/round-steps";

export const STAFF_RECORDED_MESSAGE = "เจ้าหน้าที่/อสม. บันทึกรายการนี้แล้ว";

/**
 * FR-7: on the patient self-recording path a round record made by another user (staff/อสม.) is never
 * replaced. The patient may create a record or re-record their own; staff keep the right to correct
 * a patient record. Called before any write, so a rejection leaves no ledger entry or receipt.
 */
export function assertPatientMayRecordOver(
  context: ActivePatientProgramMutationContext,
  existing: { recordedByUserId: string | null } | null,
): void {
  if (!context.patientSelfRecording || !existing) {
    return;
  }

  if (existing.recordedByUserId !== context.access.patient.userId) {
    throw new RoundConflictError(STAFF_RECORDED_MESSAGE);
  }
}

/**
 * FR-7 / FR-7b: a round's VITALS evidence is its round vitals row or its Follow-up measurements, and the
 * latest recorded source wins. On the patient self-recording path neither a staff vitals row nor a
 * Follow-up holding measurements may be out-ranked, so the patient write is refused before any write.
 */
export async function assertPatientMayRecordVitals(
  transaction: Prisma.TransactionClient,
  context: ActivePatientProgramMutationContext,
  existing: { recordedByUserId: string | null } | null,
  roundNumber: number,
): Promise<void> {
  if (!context.patientSelfRecording) {
    return;
  }

  assertPatientMayRecordOver(context, existing);

  if (!isFollowupRound(roundNumber)) {
    return;
  }

  const followup = await transaction.patientFollowup.findUnique({
    where: {
      patientProgramId_roundNumber: {
        patientProgramId: context.program.id,
        roundNumber: toFollowupRoundNumber(roundNumber),
      },
    },
    select: {
      weight: true,
      heightCm: true,
      waistCircumference: true,
      bloodSugar: true,
      systolicBloodPressure: true,
      diastolicBloodPressure: true,
    },
  });

  if (followupHoldsVitals(followup)) {
    throw new RoundConflictError(STAFF_RECORDED_MESSAGE);
  }
}
