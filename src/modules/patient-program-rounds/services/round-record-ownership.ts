import "server-only";

import type { ActivePatientProgramMutationContext } from "@/modules/patient-program/services/patient-program-lifecycle-service";

import { RoundConflictError } from "../domain/round-conflict-error";

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
