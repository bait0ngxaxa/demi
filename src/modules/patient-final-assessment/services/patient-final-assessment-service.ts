import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { lockActivePatientProgram } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import { PATIENT_PROGRAM_MANAGE_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  patientFinalAssessmentCreateRequestSchema,
  type PatientFinalAssessmentCreateRequest,
} from "../schemas/patient-final-assessment-schemas";

export type PatientFinalAssessmentDatabase = PrismaClient;

export type PatientFinalAssessmentServiceDependencies = {
  database?: PatientFinalAssessmentDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientFinalAssessmentCreateResult = {
  patientFinalAssessmentId: string;
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  recordedByUserId: string;
  recordedAt: Date;
  createdAt: Date;
};

const DEFAULT_TRANSACTION_RETRIES = 2;

const patientFinalAssessmentMutationSelect = {
  id: true,
  patientProgramId: true,
  patientHospitalRelationshipId: true,
  recordedByUserId: true,
  recordedAt: true,
  createdAt: true,
} satisfies Prisma.PatientFinalAssessmentSelect;

type PatientFinalAssessmentMutationRecord = Prisma.PatientFinalAssessmentGetPayload<{
  select: typeof patientFinalAssessmentMutationSelect;
}>;

type NormalizedPatientFinalAssessmentRequest = {
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
};

function getDatabase(
  dependencies: PatientFinalAssessmentServiceDependencies,
): PatientFinalAssessmentDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientFinalAssessmentServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Final Assessment time could not be resolved");
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

  if (isKnownRequestError(error, "P2002")) {
    return new ConflictError("This Program already has a Final Assessment");
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError("The Final Assessment operation conflicted with another request");
  }

  if (isKnownRequestError(error, "P2003")) {
    return new ConflictError("Final Assessment ownership is inconsistent");
  }

  return new InfrastructureError("Final Assessment could not be saved");
}

async function runSerializable<T>(
  database: PatientFinalAssessmentDatabase,
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

function normalizeInput(
  input: PatientFinalAssessmentCreateRequest,
): NormalizedPatientFinalAssessmentRequest {
  return {
    patientProgramId: input.patientProgramId.toLowerCase(),
    patientHospitalRelationshipId: input.patientHospitalRelationshipId.toLowerCase(),
    weight: input.weight ?? null,
    waistCircumference: input.waistCircumference ?? null,
    systolicBloodPressure: input.systolicBloodPressure ?? null,
    diastolicBloodPressure: input.diastolicBloodPressure ?? null,
    bloodSugar: input.bloodSugar ?? null,
  };
}

function toCreateResult(
  record: PatientFinalAssessmentMutationRecord,
  hospitalId: string,
): PatientFinalAssessmentCreateResult {
  return {
    patientFinalAssessmentId: record.id,
    patientProgramId: record.patientProgramId,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    hospitalId,
    recordedByUserId: record.recordedByUserId,
    recordedAt: record.recordedAt,
    createdAt: record.createdAt,
  };
}

async function createInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientFinalAssessmentCreateRequest,
  now: Date,
): Promise<PatientFinalAssessmentCreateResult> {
  const normalized = normalizeInput(input);
  const locked = await lockActivePatientProgram(
    transaction,
    actor,
    normalized.patientProgramId,
  );

  if (
    locked.access.patient.patientHospitalRelationshipId !==
    normalized.patientHospitalRelationshipId
  ) {
    throw new NotFoundError();
  }

  const existing = await transaction.patientFinalAssessment.findUnique({
    where: { patientProgramId: locked.program.id },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError("This Program already has a Final Assessment");
  }

  const finalAssessment = await transaction.patientFinalAssessment.create({
    data: {
      patientProgramId: locked.program.id,
      patientHospitalRelationshipId: locked.program.patientHospitalRelationshipId,
      recordedByUserId: locked.access.actor.userId,
      weight: normalized.weight,
      waistCircumference: normalized.waistCircumference,
      systolicBloodPressure: normalized.systolicBloodPressure,
      diastolicBloodPressure: normalized.diastolicBloodPressure,
      bloodSugar: normalized.bloodSugar,
      recordedAt: now,
      createdAt: now,
    },
    select: patientFinalAssessmentMutationSelect,
  });

  await recordAuditEvent(
    {
      actorUserId: locked.access.actor.userId,
      action: "patient_final_assessment.created",
      resourceType: "PatientFinalAssessment",
      resourceId: finalAssessment.id,
      metadata: {
        patientFinalAssessmentId: finalAssessment.id,
        patientProgramId: finalAssessment.patientProgramId,
        patientHospitalRelationshipId: finalAssessment.patientHospitalRelationshipId,
        hospitalId: locked.access.target.hospitalId,
      },
    },
    transaction,
  );

  return toCreateResult(finalAssessment, locked.access.target.hospitalId);
}

export async function createPatientFinalAssessment(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientFinalAssessmentServiceDependencies = {},
): Promise<PatientFinalAssessmentCreateResult> {
  const parsed = patientFinalAssessmentCreateRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Final Assessment submission data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => createInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientFinalAssessmentServiceInternals = {
  createInTransaction,
  isKnownRequestError,
  isRetryableTransactionError,
  normalizeDatabaseError,
  normalizeInput,
  runSerializable,
  toCreateResult,
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
};
