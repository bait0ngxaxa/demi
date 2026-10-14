import "server-only";

import {
  Prisma,
  type PatientProgramRoundToolCode,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { lockActivePatientProgram } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";
import { isServiceDateAfter, serviceDateToUtcDate } from "@/shared/time/service-date";

import {
  isProgramRoundNumber,
  isRecommendedTool,
  SERVICE_ONE_HOME_ROUND,
  SERVICE_ONE_TOOL_LINKED_RECORD_TYPES,
} from "../domain/round-catalog";
import {
  roundReviewRequestSchema,
  roundVitalsRequestSchema,
  type RoundReviewRequest,
  type RoundVitalsRequest,
} from "../schemas/round-schemas";
import { ensureRoundLedgerEntry } from "./round-ledger";

export type PatientProgramRoundDatabase = PrismaClient;

export type PatientProgramRoundServiceDependencies = {
  database?: PatientProgramRoundDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientProgramRoundOperation = "RECORDED" | "ALREADY_RECORDED";

export type PatientProgramRoundVitalsResult = {
  operation: PatientProgramRoundOperation;
  roundVitalsId: string;
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  roundNumber: number;
};

export type PatientProgramRoundReviewResult = {
  operation: PatientProgramRoundOperation;
  roundActivityId: string;
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  roundNumber: number;
  toolCode: PatientProgramRoundToolCode;
  source: "PLANNED" | "EXTRA";
};

const DEFAULT_TRANSACTION_RETRIES = 2;

const roundVitalsSelect = {
  id: true,
  patientProgramId: true,
  patientHospitalRelationshipId: true,
  roundNumber: true,
  serviceDate: true,
  weight: true,
  heightCm: true,
  waistCircumference: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  bloodSugar: true,
  recordedByUserId: true,
} satisfies Prisma.PatientProgramRoundVitalsSelect;

function getDatabase(
  dependencies: PatientProgramRoundServiceDependencies,
): PatientProgramRoundDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientProgramRoundServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Round time could not be resolved");
  }

  return copy;
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034");
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034")) {
    return new ConflictError("ข้อมูลครั้งนี้ถูกบันทึกพร้อมกับคำขออื่น กรุณาตรวจสอบข้อมูลล่าสุด");
  }

  if (isKnownRequestError(error, "P2003")) {
    return new ConflictError("ข้อมูลความสัมพันธ์ของครั้งนี้ไม่สอดคล้องกัน");
  }

  return new InfrastructureError("Program round could not be saved");
}

async function runSerializable<T>(
  database: PatientProgramRoundDatabase,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryLimit: number,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isRetryableTransactionError(error) || retryCount >= retryLimit) {
        throw error;
      }

      retryCount += 1;
    }
  }
}

type PersistedRoundVitals = Prisma.PatientProgramRoundVitalsGetPayload<{
  select: typeof roundVitalsSelect;
}>;

function hasSameVitals(
  existing: PersistedRoundVitals,
  input: RoundVitalsRequest,
  actorUserId: string,
  programId: string,
): boolean {
  return (
    existing.patientProgramId === programId &&
    existing.roundNumber === input.roundNumber &&
    existing.recordedByUserId === actorUserId &&
    existing.serviceDate.toISOString().slice(0, 10) === input.serviceDate &&
    existing.weight === (input.weight ?? null) &&
    existing.heightCm === (input.heightCm ?? null) &&
    existing.waistCircumference === (input.waistCircumference ?? null) &&
    existing.systolicBloodPressure === (input.systolicBloodPressure ?? null) &&
    existing.diastolicBloodPressure === (input.diastolicBloodPressure ?? null) &&
    existing.bloodSugar === (input.bloodSugar ?? null)
  );
}

function toVitalsResult(
  operation: PatientProgramRoundOperation,
  record: Pick<
    PersistedRoundVitals,
    "id" | "patientProgramId" | "patientHospitalRelationshipId" | "roundNumber"
  >,
): PatientProgramRoundVitalsResult {
  return {
    operation,
    roundVitalsId: record.id,
    patientProgramId: record.patientProgramId,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    roundNumber: record.roundNumber,
  };
}

async function recordVitalsInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: RoundVitalsRequest,
  now: Date,
): Promise<PatientProgramRoundVitalsResult> {
  if (isServiceDateAfter(input.serviceDate, now)) {
    throw new ValidationError("The round service date cannot be in the future");
  }

  const programId = input.patientProgramId.toLowerCase();
  const { access, program } = await lockActivePatientProgram(transaction, actor, programId);
  const relationshipId = access.patient.patientHospitalRelationshipId;

  const byNonce = await transaction.patientProgramRoundVitals.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: roundVitalsSelect,
  });

  if (byNonce) {
    if (!hasSameVitals(byNonce, input, access.actor.userId, program.id)) {
      throw new ConflictError("This round vitals submission token has already been used");
    }

    return toVitalsResult("ALREADY_RECORDED", byNonce);
  }

  const existing = await transaction.patientProgramRoundVitals.findUnique({
    where: {
      patientProgramId_roundNumber: {
        patientProgramId: program.id,
        roundNumber: input.roundNumber,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError("ครั้งนี้มีการบันทึกสัญญาณชีพไว้แล้วและไม่สามารถบันทึกซ้ำได้");
  }

  const record = await transaction.patientProgramRoundVitals.create({
    data: {
      patientProgramId: program.id,
      patientHospitalRelationshipId: relationshipId,
      roundNumber: input.roundNumber,
      serviceDate: serviceDateToUtcDate(input.serviceDate),
      weight: input.weight ?? null,
      heightCm: input.heightCm ?? null,
      waistCircumference: input.waistCircumference ?? null,
      systolicBloodPressure: input.systolicBloodPressure ?? null,
      diastolicBloodPressure: input.diastolicBloodPressure ?? null,
      bloodSugar: input.bloodSugar ?? null,
      recordedByUserId: access.actor.userId,
      submissionNonce: input.submissionNonce,
      recordedAt: now,
      createdAt: now,
    },
    select: roundVitalsSelect,
  });

  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_program_round.vitals_recorded",
      resourceType: "PatientProgramRoundVitals",
      resourceId: record.id,
      metadata: {
        patientProgramId: program.id,
        patientHospitalRelationshipId: relationshipId,
        hospitalId: access.target.hospitalId,
        roundNumber: input.roundNumber,
      },
    },
    transaction,
  );

  return toVitalsResult("RECORDED", record);
}

/** Resolves the existing Program-level result a tool review points at, or null when none exists. */
async function findReviewTarget(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  toolCode: PatientProgramRoundToolCode,
): Promise<string | null> {
  const where = { patientProgramId };
  const select = { id: true } as const;
  let record: { id: string } | null = null;

  switch (toolCode) {
    case "PAM":
    case "PROMS":
      record = await transaction.screeningAssessment.findUnique({ where, select });
      break;
    case "ROUTINE":
      record = await transaction.patientProgramServiceOneRoutine.findUnique({ where, select });
      break;
    case "FLOATING_CHART":
      record = await transaction.patientProgramServiceOneFloatingChart.findUnique({ where, select });
      break;
    case "DREAM_CARD":
      record = await transaction.patientProgramServiceOneDreamCard.findUnique({ where, select });
      break;
    case "CONFIDENCE_RULER":
      record = await transaction.patientProgramServiceOneConfidence.findUnique({ where, select });
      break;
    default:
      record = null;
  }

  return record?.id ?? null;
}

async function recordReviewInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: RoundReviewRequest,
  now: Date,
): Promise<PatientProgramRoundReviewResult> {
  const roundNumber = input.roundNumber;

  if (!isProgramRoundNumber(roundNumber)) {
    throw new ValidationError("The program round is invalid");
  }

  const programId = input.patientProgramId.toLowerCase();
  const { access, program } = await lockActivePatientProgram(transaction, actor, programId);
  const relationshipId = access.patient.patientHospitalRelationshipId;
  const linkedRecordType = SERVICE_ONE_TOOL_LINKED_RECORD_TYPES[input.toolCode];

  if (!linkedRecordType) {
    throw new ValidationError("This tool cannot be reviewed");
  }

  const byNonce = await transaction.patientProgramRoundActivity.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: {
      id: true,
      patientProgramId: true,
      roundNumber: true,
      toolCode: true,
      source: true,
      recordedByUserId: true,
    },
  });

  if (byNonce) {
    if (
      byNonce.patientProgramId !== program.id ||
      byNonce.roundNumber !== roundNumber ||
      byNonce.toolCode !== input.toolCode ||
      byNonce.recordedByUserId !== access.actor.userId
    ) {
      throw new ConflictError("This round activity submission token has already been used");
    }

    return {
      operation: "ALREADY_RECORDED",
      roundActivityId: byNonce.id,
      patientProgramId: program.id,
      patientHospitalRelationshipId: relationshipId,
      roundNumber,
      toolCode: byNonce.toolCode,
      source: byNonce.source,
    };
  }

  if (roundNumber === SERVICE_ONE_HOME_ROUND) {
    throw new ConflictError("เครื่องมือนี้บันทึกในครั้งที่ 1 ไม่ต้องทบทวนซ้ำในครั้งเดียวกัน");
  }

  const linkedRecordId = await findReviewTarget(transaction, program.id, input.toolCode);

  if (!linkedRecordId) {
    throw new ConflictError("ยังไม่มีผลเดิมของเครื่องมือนี้ให้ทบทวน กรุณาบันทึกในครั้งที่ 1 ก่อน");
  }

  const { entry, created } = await ensureRoundLedgerEntry(transaction, {
    patientProgramId: program.id,
    patientHospitalRelationshipId: relationshipId,
    roundNumber,
    toolCode: input.toolCode,
    source: isRecommendedTool(roundNumber, input.toolCode) ? "PLANNED" : "EXTRA",
    mode: "REVIEWED",
    linkedRecordType,
    linkedRecordId,
    recordedByUserId: access.actor.userId,
    performedAt: now,
    submissionNonce: input.submissionNonce,
  });

  if (created) {
    await recordAuditEvent(
      {
        actorUserId: access.actor.userId,
        action: "patient_program_round.activity_reviewed",
        resourceType: "PatientProgramRoundActivity",
        resourceId: entry.id,
        metadata: {
          patientProgramId: program.id,
          patientHospitalRelationshipId: relationshipId,
          hospitalId: access.target.hospitalId,
          roundNumber,
          toolCode: input.toolCode,
          source: entry.source,
          mode: entry.mode,
        },
      },
      transaction,
    );
  }

  return {
    operation: created ? "RECORDED" : "ALREADY_RECORDED",
    roundActivityId: entry.id,
    patientProgramId: program.id,
    patientHospitalRelationshipId: relationshipId,
    roundNumber,
    toolCode: entry.toolCode,
    source: entry.source,
  };
}

export async function recordPatientProgramRoundVitals(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<PatientProgramRoundVitalsResult> {
  const parsed = roundVitalsRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Round vitals submission data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => recordVitalsInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function recordPatientProgramRoundReview(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<PatientProgramRoundReviewResult> {
  const parsed = roundReviewRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Round activity submission data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => recordReviewInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientProgramRoundServiceInternals = {
  findReviewTarget,
  hasSameVitals,
  normalizeDatabaseError,
  recordReviewInTransaction,
  recordVitalsInTransaction,
  runSerializable,
};
