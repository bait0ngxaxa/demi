import "server-only";

import { randomUUID } from "node:crypto";

import type {
  PatientProgramRoundActivityMode,
  PatientProgramRoundActivitySource,
  PatientProgramRoundLinkedRecordType,
  PatientProgramRoundToolCode,
  Prisma,
} from "@prisma/client";

export type RoundLedgerEntryInput = {
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  roundNumber: number;
  toolCode: PatientProgramRoundToolCode;
  source: PatientProgramRoundActivitySource;
  mode: PatientProgramRoundActivityMode;
  linkedRecordType: PatientProgramRoundLinkedRecordType | null;
  linkedRecordId: string | null;
  recordedByUserId: string;
  performedAt: Date;
  /** Caller-supplied token for navigator submissions; system-linked entries get a fresh one. */
  submissionNonce?: string;
};

export const roundLedgerSelect = {
  id: true,
  patientProgramId: true,
  roundNumber: true,
  toolCode: true,
  source: true,
  mode: true,
  linkedRecordType: true,
  linkedRecordId: true,
  performedAt: true,
  recordedByUserId: true,
  submissionNonce: true,
} satisfies Prisma.PatientProgramRoundActivitySelect;

export type RoundLedgerRecord = Prisma.PatientProgramRoundActivityGetPayload<{
  select: typeof roundLedgerSelect;
}>;

/**
 * Writes one ledger row inside the caller's transaction. The (program, round, tool) unique key is
 * the idempotency backstop: when the row already exists it is returned unchanged.
 */
export async function ensureRoundLedgerEntry(
  transaction: Prisma.TransactionClient,
  input: RoundLedgerEntryInput,
): Promise<{ entry: RoundLedgerRecord; created: boolean }> {
  const existing = await transaction.patientProgramRoundActivity.findUnique({
    where: {
      patientProgramId_roundNumber_toolCode: {
        patientProgramId: input.patientProgramId,
        roundNumber: input.roundNumber,
        toolCode: input.toolCode,
      },
    },
    select: roundLedgerSelect,
  });

  if (existing) {
    return { entry: existing, created: false };
  }

  const entry = await transaction.patientProgramRoundActivity.create({
    data: {
      patientProgramId: input.patientProgramId,
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      roundNumber: input.roundNumber,
      toolCode: input.toolCode,
      source: input.source,
      mode: input.mode,
      linkedRecordType: input.linkedRecordType,
      linkedRecordId: input.linkedRecordId,
      performedAt: input.performedAt,
      recordedByUserId: input.recordedByUserId,
      submissionNonce: input.submissionNonce ?? randomUUID(),
    },
    select: roundLedgerSelect,
  });

  return { entry, created: true };
}
