import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActivePatientProgramMutationContext } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import { ValidationError } from "@/shared/errors/application-error";
import { RoundConflictError } from "../domain/round-conflict-error";
import type { RoundStepCode } from "../domain/round-steps";

type RecordingInput = { patientProgramId: string; roundNumber: number; submissionNonce?: string };
const ACTION = "patient_program_round.recording_request";

function requestHash(input: RecordingInput, stepCode: RoundStepCode): string {
  return createHash("sha256").update(JSON.stringify({ stepCode, ...input })).digest("hex");
}

/** Immutable receipt: retries cannot reapply an old answer after a later correction. */
export async function findRoundRecordingReceipt(transaction: Prisma.TransactionClient, context: ActivePatientProgramMutationContext, input: RecordingInput, stepCode: RoundStepCode): Promise<string | null> {
  if (!input.submissionNonce) {
    if (context.patientSelfRecording) throw new ValidationError("ต้องมีรหัสคำขอสำหรับการบันทึกของผู้ป่วย");
    return null;
  }
  const receipt = await transaction.auditEvent.findFirst({ where: { action: ACTION, metadata: { path: ["submissionNonce"], equals: input.submissionNonce } }, select: { actorUserId: true, resourceId: true, metadata: true } });
  if (!receipt) return null;
  const metadata = receipt.metadata;
  if (receipt.actorUserId !== context.access.actor.userId || !receipt.resourceId || !metadata || typeof metadata !== "object" || Array.isArray(metadata) || metadata.requestHash !== requestHash(input, stepCode)) throw new RoundConflictError("รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว");
  return receipt.resourceId;
}

export async function recordRoundRecordingReceipt(transaction: Prisma.TransactionClient, context: ActivePatientProgramMutationContext, input: RecordingInput, stepCode: RoundStepCode, recordId: string): Promise<void> {
  if (!input.submissionNonce) return;
  await recordAuditEvent({ actorUserId: context.access.actor.userId, action: ACTION, resourceType: "PatientProgramRoundRecording", resourceId: recordId, metadata: { patientProgramId: context.program.id, patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId, roundNumber: input.roundNumber, stepCode, submissionNonce: input.submissionNonce, requestHash: requestHash(input, stepCode) } }, transaction);
}
