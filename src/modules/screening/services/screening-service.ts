import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  getQuestionSet,
  SCREENING_QUESTION_SET_KEY,
  SCREENING_QUESTION_SET_VERSION,
} from "../domain/question-sets";
import { validateScreeningResponses } from "../domain/response-validation";
import {
  getScoringDefinition,
  LEGACY_PROTOTYPE_SCORING_VERSION,
  type ScreeningScoreResult,
} from "../domain/scoring";
import { SCREENING_SUBMIT_CAPABILITY } from "../policies/screening-policy";
import {
  screeningResultSchema,
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
  result: ScreeningScoreResult;
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

function getPrototypeDefinitions(): {
  questionSet: NonNullable<ReturnType<typeof getQuestionSet>>;
  scoringVersion: string;
  scoring: NonNullable<ReturnType<typeof getScoringDefinition>>;
} {
  const questionSet = getQuestionSet(SCREENING_QUESTION_SET_KEY, SCREENING_QUESTION_SET_VERSION);
  const scoring = getScoringDefinition(LEGACY_PROTOTYPE_SCORING_VERSION);

  if (!questionSet || !scoring) {
    throw new InfrastructureError("Screening prototype definitions are unavailable");
  }

  return {
    questionSet,
    scoringVersion: LEGACY_PROTOTYPE_SCORING_VERSION,
    scoring,
  };
}

function toSubmissionResult(input: {
  screeningAssessmentId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  submittedAt: Date;
  result: unknown;
}): ScreeningSubmissionResult {
  const parsedResult = screeningResultSchema.safeParse(input.result);

  if (!parsedResult.success) {
    throw new InfrastructureError("Persisted Screening result is invalid");
  }

  return {
    screeningAssessmentId: input.screeningAssessmentId,
    patientHospitalRelationshipId: input.patientHospitalRelationshipId,
    hospitalId: input.hospitalId,
    submittedAt: input.submittedAt,
    result: parsedResult.data,
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
  const { questionSet, scoringVersion, scoring } = getPrototypeDefinitions();
  const responses = validateScreeningResponses(input.responses, questionSet);
  const result = scoring.calculate(responses);

  const existing = await transaction.screeningAssessment.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: {
      id: true,
      patientHospitalRelationshipId: true,
      conductedByUserId: true,
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
      result: existing.result,
    });
  }

  const assessment = await transaction.screeningAssessment.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      conductedByUserId: actor.userId,
      submissionNonce: input.submissionNonce,
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
  getPrototypeDefinitions,
  hasSameJson,
  isRetryableTransactionError,
  normalizeDatabaseError,
  runSerializable,
  submitInTransaction,
  toJsonObject,
};
