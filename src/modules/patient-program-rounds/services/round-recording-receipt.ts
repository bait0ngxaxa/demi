import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActivePatientProgramMutationContext } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import { ValidationError } from "@/shared/errors/application-error";
import { RoundConflictError } from "../domain/round-conflict-error";
import type { RoundStepCode } from "../domain/round-steps";

type RecordingInput = { patientProgramId: string; roundNumber: number; submissionNonce?: string };
const ACTION = "patient_program_round.recording_request";

export type RoundSubmissionReceipt = {
  actorUserId: string | null;
  resourceId: string | null;
  requestHash: string | null;
};

/*
 * Receipt lookups repeat the expression and a constant action predicate of the partial unique index
 * "AuditEvent_round_plan_submission_nonce_key" (migration 20261127100000), so PostgreSQL can use it and an
 * unrelated audit event that carries a "submissionNonce" metadata key is never taken for a receipt.
 * Prisma's JSON-path filter compiles to `metadata #> ARRAY[...]`, so at best it scans the whole index for the
 * action predicate and filters the nonce afterwards.
 */
export function roundPlanReceiptQuery(submissionNonce: string): Prisma.Sql {
  return Prisma.sql`
    SELECT "actorUserId"::text AS "actorUserId", "resourceId", "metadata"->>'requestHash' AS "requestHash"
    FROM "AuditEvent"
    WHERE ("metadata"->>'submissionNonce') = ${submissionNonce}
      AND "action" IN (
        'patient_program_round_plan_item.added',
        'patient_program_round_plan_item.removed',
        'patient_program_round_plan_item.done',
        'patient_program_round_plan_item.undone'
      )
    LIMIT 1`;
}

export function roundRecordingReceiptQuery(submissionNonce: string): Prisma.Sql {
  return Prisma.sql`
    SELECT "actorUserId"::text AS "actorUserId", "resourceId", "metadata"->>'requestHash' AS "requestHash"
    FROM "AuditEvent"
    WHERE ("metadata"->>'submissionNonce') = ${submissionNonce}
      AND "action" = 'patient_program_round.recording_request'
    LIMIT 1`;
}

export async function findRoundSubmissionReceipt(
  transaction: Prisma.TransactionClient,
  query: Prisma.Sql,
): Promise<RoundSubmissionReceipt | null> {
  const rows = await transaction.$queryRaw<RoundSubmissionReceipt[]>(query);

  return rows[0] ?? null;
}

function requestHash(input: RecordingInput, stepCode: RoundStepCode): string {
  return createHash("sha256").update(JSON.stringify({ stepCode, ...input })).digest("hex");
}

/** Immutable receipt: retries cannot reapply an old answer after a later correction. */
export async function findRoundRecordingReceipt(
  transaction: Prisma.TransactionClient,
  context: ActivePatientProgramMutationContext,
  input: RecordingInput,
  stepCode: RoundStepCode,
): Promise<string | null> {
  if (!input.submissionNonce) {
    if (context.patientSelfRecording) {
      throw new ValidationError("ต้องมีรหัสคำขอสำหรับการบันทึกของผู้ป่วย");
    }

    return null;
  }

  const receipt = await findRoundSubmissionReceipt(
    transaction,
    roundRecordingReceiptQuery(input.submissionNonce),
  );

  if (!receipt) {
    return null;
  }

  if (
    receipt.actorUserId !== context.access.actor.userId ||
    !receipt.resourceId ||
    receipt.requestHash !== requestHash(input, stepCode)
  ) {
    throw new RoundConflictError("รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว");
  }

  return receipt.resourceId;
}

export async function recordRoundRecordingReceipt(
  transaction: Prisma.TransactionClient,
  context: ActivePatientProgramMutationContext,
  input: RecordingInput,
  stepCode: RoundStepCode,
  recordId: string,
): Promise<void> {
  if (!input.submissionNonce) {
    return;
  }

  await recordAuditEvent(
    {
      actorUserId: context.access.actor.userId,
      action: ACTION,
      resourceType: "PatientProgramRoundRecording",
      resourceId: recordId,
      metadata: {
        patientProgramId: context.program.id,
        patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId,
        roundNumber: input.roundNumber,
        stepCode,
        submissionNonce: input.submissionNonce,
        requestHash: requestHash(input, stepCode),
      },
    },
    transaction,
  );
}
