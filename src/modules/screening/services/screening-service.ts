import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  roundActivitySourceFor,
  SERVICE_ONE_HOME_ROUND,
} from "@/modules/patient-program-rounds/domain/round-catalog";
import { ensureRoundLedgerEntry } from "@/modules/patient-program-rounds/services/round-ledger";
import { assertRoundWritable } from "@/modules/patient-program-rounds/services/round-sequencing";
import { lockActivePatientProgram } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import { CURRENT_INSTRUMENT_QUESTION_SETS } from "../domain/question-sets";
import { validateInstrumentAnswers } from "../domain/response-validation";
import { CURRENT_INSTRUMENT_SCORING } from "../domain/scoring";
import { parseScreeningOutcome, type ScreeningOutcome } from "../domain/screening-outcome";
import { SCREENING_SUBMIT_CAPABILITY } from "../policies/screening-policy";
import {
  screeningSubmitRequestSchema,
  type ScreeningSubmitRequest,
} from "../schemas/screening-schemas";
import {
  resolveScreeningAccessContext,
} from "./screening-access-service";

export type ScreeningDatabase = PrismaClient;

export type ScreeningServiceDependencies = {
  database?: ScreeningDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type ScreeningSubmissionResult = {
  screeningAssessmentId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  submittedAt: Date;
  instrument: ScreeningSubmitRequest["instrument"];
  outcome: ScreeningOutcome;
};

const DEFAULT_TRANSACTION_RETRIES = 2;

function getDatabase(dependencies: ScreeningServiceDependencies): ScreeningDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: ScreeningServiceDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002")) {
    return new ConflictError("The Screening submission conflicted with another request");
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError("The Screening submission conflicted with another request");
  }

  return new InfrastructureError("Screening could not be submitted");
}

async function runSerializable<T>(
  database: ScreeningDatabase,
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

function toJsonObject(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (typeof value === "object" && value !== null) {
    const objectValue = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(objectValue)
        .sort()
        .map((key) => [key, canonicalizeJson(objectValue[key])]),
    );
  }

  return value;
}

function hasSameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right));
}

function toSubmissionResult(input: {
  screeningAssessmentId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  submittedAt: Date;
  instrument: ScreeningSubmitRequest["instrument"];
  scoringVersion: string;
  result: unknown;
}): ScreeningSubmissionResult {
  const outcome = parseScreeningOutcome(input.instrument, input.scoringVersion, input.result);

  if (!outcome) {
    throw new InfrastructureError("Persisted Screening result is invalid");
  }

  return {
    screeningAssessmentId: input.screeningAssessmentId,
    patientHospitalRelationshipId: input.patientHospitalRelationshipId,
    hospitalId: input.hospitalId,
    submittedAt: input.submittedAt,
    instrument: input.instrument,
    outcome,
  };
}

async function submitInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: ScreeningSubmitRequest,
  now: Date,
): Promise<ScreeningSubmissionResult> {
  const access = await resolveScreeningAccessContext(
    actor,
    input.patientHospitalRelationshipId,
    SCREENING_SUBMIT_CAPABILITY,
    transaction,
  );
  const questionSet = CURRENT_INSTRUMENT_QUESTION_SETS[input.instrument];
  const scoring = CURRENT_INSTRUMENT_SCORING[input.instrument];
  const scoringVersion = scoring.version;
  const responses = { answers: validateInstrumentAnswers(input.responses, questionSet) };
  const result = scoring.calculate(responses.answers);

  const existing = await transaction.screeningAssessment.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: {
      id: true,
      patientHospitalRelationshipId: true,
      conductedByUserId: true,
      patientProgramId: true,
      instrument: true,
      questionSetKey: true,
      questionSetVersion: true,
      scoringVersion: true,
      responses: true,
      result: true,
      submittedAt: true,
    },
  });

  if (existing) {
    const matchesSameSubmission =
      existing.patientHospitalRelationshipId === input.patientHospitalRelationshipId &&
      existing.conductedByUserId === actor.userId &&
      (existing.patientProgramId ?? null) === (input.patientProgramId?.toLowerCase() ?? null) &&
      existing.instrument === input.instrument &&
      existing.questionSetKey === questionSet.key &&
      existing.questionSetVersion === questionSet.version &&
      existing.scoringVersion === scoringVersion &&
      hasSameJson(existing.responses, responses) &&
      hasSameJson(existing.result, result);

    if (!matchesSameSubmission) {
      throw new ConflictError("This Screening submission token has already been used");
    }

    return toSubmissionResult({
      screeningAssessmentId: existing.id,
      patientHospitalRelationshipId: existing.patientHospitalRelationshipId,
      hospitalId: access.target.hospitalId,
      submittedAt: existing.submittedAt,
      instrument: input.instrument,
      scoringVersion: existing.scoringVersion,
      result: existing.result,
    });
  }

  let programLink: Awaited<ReturnType<typeof lockActivePatientProgram>> | null = null;

  if (input.patientProgramId) {
    programLink = await lockActivePatientProgram(
      transaction,
      actor,
      input.patientProgramId.toLowerCase(),
    );

    if (
      programLink.access.patient.patientHospitalRelationshipId !==
      access.patient.patientHospitalRelationshipId
    ) {
      throw new NotFoundError();
    }

    // R2-C: one result per instrument; a legacy combined screening already answers both.
    const linked = await transaction.screeningAssessment.findFirst({
      where: { patientProgramId: programLink.program.id, instrument: { in: ["COMBINED", input.instrument] } },
      select: { id: true },
    });

    if (linked) {
      throw new ConflictError(
        `โปรแกรมนี้มีแบบประเมิน ${input.instrument === "PAM" ? "PAM" : "PROMs"} ที่บันทึกในครั้งที่ 1 แล้ว`,
      );
    }

    // SR-D5: the program screening is a round 1 step.
    await assertRoundWritable(transaction, programLink.program.id, SERVICE_ONE_HOME_ROUND);
  }

  const assessment = await transaction.screeningAssessment.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      patientProgramId: programLink?.program.id ?? null,
      conductedByUserId: actor.userId,
      submissionNonce: input.submissionNonce,
      instrument: input.instrument,
      questionSetKey: questionSet.key,
      questionSetVersion: questionSet.version,
      scoringVersion,
      responses: toJsonObject(responses),
      result: toJsonObject(result),
      submittedAt: now,
      createdAt: now,
    },
    select: {
      id: true,
      submittedAt: true,
      result: true,
    },
  });

  if (programLink) {
    await ensureRoundLedgerEntry(transaction, {
      patientProgramId: programLink.program.id,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      roundNumber: SERVICE_ONE_HOME_ROUND,
      toolCode: input.instrument,
      source: roundActivitySourceFor(SERVICE_ONE_HOME_ROUND, input.instrument),
      mode: "RECORDED",
      linkedRecordType: "SCREENING_ASSESSMENT",
      linkedRecordId: assessment.id,
      recordedByUserId: actor.userId,
      performedAt: now,
    });
  }

  await recordAuditEvent(
    {
      actorUserId: actor.userId,
      action: "screening.submitted",
      resourceType: "ScreeningAssessment",
      resourceId: assessment.id,
      metadata: {
        screeningAssessmentId: assessment.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        ...(programLink ? { patientProgramId: programLink.program.id } : {}),
        instrument: input.instrument,
        questionSetVersion: questionSet.version,
        scoringVersion,
      },
    },
    transaction,
  );

  return toSubmissionResult({
    screeningAssessmentId: assessment.id,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    hospitalId: access.target.hospitalId,
    submittedAt: assessment.submittedAt,
    instrument: input.instrument,
    scoringVersion,
    result: assessment.result,
  });
}

export async function submitScreening(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ScreeningServiceDependencies = {},
): Promise<ScreeningSubmissionResult> {
  const parsed = screeningSubmitRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Screening submission data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => submitInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const screeningServiceInternals = {
  canonicalizeJson,
  hasSameJson,
  isRetryableTransactionError,
  normalizeDatabaseError,
  runSerializable,
  submitInTransaction,
  toJsonObject,
};
