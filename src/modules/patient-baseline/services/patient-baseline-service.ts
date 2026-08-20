import "server-only";

import { PatientProgramStatus, Prisma, type PrismaClient } from "@prisma/client";

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

import { PATIENT_BASELINE_CREATE_CAPABILITY } from "../policies/patient-baseline-policy";
import {
  dateOnlyToUtcDate,
  patientBaselineCreateRequestSchema,
  type PatientBaselineCreateRequest,
} from "../schemas/patient-baseline-schemas";
import { resolvePatientBaselineAccessContext } from "./patient-baseline-access-service";

export type PatientBaselineDatabase = PrismaClient;

export type PatientBaselineServiceDependencies = {
  database?: PatientBaselineDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientBaselineCreateResult = {
  patientBaselineId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  recordedByUserId: string;
  recordedOn: Date;
  createdAt: Date;
};

const patientBaselineMutationSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  recordedByUserId: true,
  recordedOn: true,
  createdAt: true,
} satisfies Prisma.PatientBaselineSelect;

type PatientBaselineMutationRecord = Prisma.PatientBaselineGetPayload<{
  select: typeof patientBaselineMutationSelect;
}>;

const DEFAULT_TRANSACTION_RETRIES = 2;

type NormalizedPatientBaselineRequest = {
  patientHospitalRelationshipId: string;
  recordedOn: Date;
  weight: number | null;
  waistCircumference: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  bloodSugarDtx: number | null;
  adaptationSummary: string | null;
  adaptationObstacles: string | null;
  adaptationOpportunities: string | null;
  confidenceScore: number | null;
  confidenceImprovementPlan: string | null;
  summary: string | null;
  recommendations: string | null;
};

function getDatabase(dependencies: PatientBaselineServiceDependencies): PatientBaselineDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientBaselineServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Baseline time could not be resolved");
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
    return new ConflictError("ข้อมูลตั้งต้นของความสัมพันธ์ผู้ป่วยนี้มีอยู่แล้ว");
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError("การบันทึกข้อมูลตั้งต้นขัดแย้งกับคำขออื่น กรุณาลองอีกครั้ง");
  }

  if (isKnownRequestError(error, "P2003")) {
    return new ConflictError("ข้อมูลความสัมพันธ์ของข้อมูลตั้งต้นไม่สอดคล้องกัน");
  }

  return new InfrastructureError("Baseline could not be saved");
}

async function runSerializable<T>(
  database: PatientBaselineDatabase,
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

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeInput(input: PatientBaselineCreateRequest): NormalizedPatientBaselineRequest {
  return {
    patientHospitalRelationshipId: input.patientHospitalRelationshipId.toLowerCase(),
    recordedOn: dateOnlyToUtcDate(input.recordedOn),
    weight: input.weight ?? null,
    waistCircumference: input.waistCircumference ?? null,
    bloodPressureSystolic: input.bloodPressureSystolic ?? null,
    bloodPressureDiastolic: input.bloodPressureDiastolic ?? null,
    bloodSugarDtx: input.bloodSugarDtx ?? null,
    adaptationSummary: nullableText(input.adaptationSummary),
    adaptationObstacles: nullableText(input.adaptationObstacles),
    adaptationOpportunities: nullableText(input.adaptationOpportunities),
    confidenceScore: input.confidenceScore ?? null,
    confidenceImprovementPlan: nullableText(input.confidenceImprovementPlan),
    summary: nullableText(input.summary),
    recommendations: nullableText(input.recommendations),
  };
}

function toCreateResult(
  record: PatientBaselineMutationRecord,
  hospitalId: string,
): PatientBaselineCreateResult {
  return {
    patientBaselineId: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    hospitalId,
    recordedByUserId: record.recordedByUserId,
    recordedOn: record.recordedOn,
    createdAt: record.createdAt,
  };
}

async function createInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientBaselineCreateRequest,
  now: Date,
): Promise<PatientBaselineCreateResult> {
  const normalized = normalizeInput(input);
  const access = await resolvePatientBaselineAccessContext(
    actor,
    normalized.patientHospitalRelationshipId,
    PATIENT_BASELINE_CREATE_CAPABILITY,
    transaction,
  );

  const existing = await transaction.patientBaseline.findUnique({
    where: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError("ข้อมูลตั้งต้นของความสัมพันธ์ผู้ป่วยนี้มีอยู่แล้ว");
  }

  const baseline = await transaction.patientBaseline.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      recordedOn: normalized.recordedOn,
      recordedByUserId: access.actor.userId,
      weight: normalized.weight,
      waistCircumference: normalized.waistCircumference,
      bloodPressureSystolic: normalized.bloodPressureSystolic,
      bloodPressureDiastolic: normalized.bloodPressureDiastolic,
      bloodSugarDtx: normalized.bloodSugarDtx,
      adaptationSummary: normalized.adaptationSummary,
      adaptationObstacles: normalized.adaptationObstacles,
      adaptationOpportunities: normalized.adaptationOpportunities,
      confidenceScore: normalized.confidenceScore,
      confidenceImprovementPlan: normalized.confidenceImprovementPlan,
      summary: normalized.summary,
      recommendations: normalized.recommendations,
      createdAt: now,
    },
    select: patientBaselineMutationSelect,
  });

  // A Baseline may be recorded after an episode is opened. Link it only when
  // it has never been used by any episode, and only to the current ACTIVE
  // episode. Completed history is never retroactively changed.
  const previousUse = await transaction.patientProgram.findFirst({
    where: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      initialBaselineId: baseline.id,
    },
    select: { id: true },
  });

  if (!previousUse) {
    await transaction.patientProgram.updateMany({
      where: {
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        status: PatientProgramStatus.ACTIVE,
        initialBaselineId: null,
      },
      data: { initialBaselineId: baseline.id },
    });
  }

  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_baseline.created",
      resourceType: "PatientBaseline",
      resourceId: baseline.id,
      metadata: {
        patientBaselineId: baseline.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
    },
    transaction,
  );

  return toCreateResult(baseline, access.target.hospitalId);
}

export async function createPatientBaseline(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientBaselineServiceDependencies = {},
): Promise<PatientBaselineCreateResult> {
  const parsed = patientBaselineCreateRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Baseline submission data is invalid");
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

export const patientBaselineServiceInternals = {
  createInTransaction,
  isKnownRequestError,
  isRetryableTransactionError,
  normalizeDatabaseError,
  normalizeInput,
  nullableText,
  runSerializable,
  toCreateResult,
};
