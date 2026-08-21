import "server-only";

import { createHash } from "node:crypto";

import { AppointmentStatus, Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  getAccessibleGoalPlanActivityContext,
  getAccessibleGoalPlanActivityContextForProgram,
} from "@/modules/goals/services/goal-query-service";
import {
  resolvePatientProgramByIdAccessContext,
  type PatientProgramAccessContext,
} from "@/modules/patient-program/services/patient-program-access-service";
import { PATIENT_PROGRAM_MANAGE_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import { lockActivePatientProgram } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import type { FollowupProgressStatus } from "../domain/followup-definitions";
import { FOLLOWUP_RECORD_CAPABILITY } from "../policies/followup-policy";
import {
  followupCreateRequestSchema,
  followupProgramCreateRequestSchema,
  type FollowupProgramCreateRequest,
  type FollowupCreateRequest,
} from "../schemas/followup-schemas";
import { resolveFollowupAccessContext } from "./followup-access-service";

export type FollowupDatabase = PrismaClient;

export type FollowupServiceDependencies = {
  database?: FollowupDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type FollowupSubmissionResult = {
  followupId: string;
  patientProgramId: string | null;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  roundNumber: number;
  recordedAt: Date;
  createdAt: Date;
};

type NormalizedFollowupProgress = {
  goalActivityCode: string;
  status: FollowupProgressStatus;
  note: string | null;
};

type NormalizedFollowupRequest = {
  patientHospitalRelationshipId: string;
  patientProgramId: string | null;
  submissionNonce: string;
  appointmentId: string | null;
  sourceGoalPlanId: string | null;
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
  confidenceScore: number | null;
  reflectionNote: string | null;
  confidencePlan: string | null;
  generalNote: string | null;
  activityProgress: NormalizedFollowupProgress[];
};

const DEFAULT_TRANSACTION_RETRIES = 2;

const followupRetrySelect = {
  id: true,
  patientHospitalRelationshipId: true,
  patientProgramId: true,
  createdByUserId: true,
  submissionNonce: true,
  submissionRequestHash: true,
  roundNumber: true,
  recordedAt: true,
  createdAt: true,
} satisfies Prisma.PatientFollowupSelect;

type FollowupRetryRecord = Prisma.PatientFollowupGetPayload<{
  select: typeof followupRetrySelect;
}>;

const followupSubmissionSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  patientProgramId: true,
  roundNumber: true,
  recordedAt: true,
  createdAt: true,
} satisfies Prisma.PatientFollowupSelect;

type FollowupSubmissionRecord = Prisma.PatientFollowupGetPayload<{
  select: typeof followupSubmissionSelect;
}>;

function getDatabase(dependencies: FollowupServiceDependencies): FollowupDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: FollowupServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Follow-up time could not be resolved");
  }

  return copy;
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

  if (isRetryableTransactionError(error)) {
    return new ConflictError("The Follow-up operation conflicted with another request");
  }

  return new InfrastructureError("Follow-up could not be saved");
}

async function runSerializable<T>(
  database: FollowupDatabase,
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
  return trimmed ? trimmed : null;
}

function nullableUuid(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

function normalizeFollowupInput(
  input: FollowupCreateRequest,
  patientProgramId: string | null = null,
): NormalizedFollowupRequest {
  return {
    patientHospitalRelationshipId: input.patientHospitalRelationshipId.toLowerCase(),
    patientProgramId: patientProgramId?.toLowerCase() ?? null,
    submissionNonce: input.submissionNonce.toLowerCase(),
    appointmentId: nullableUuid(input.appointmentId),
    sourceGoalPlanId: nullableUuid(input.sourceGoalPlanId),
    weight: input.weight ?? null,
    waistCircumference: input.waistCircumference ?? null,
    systolicBloodPressure: input.systolicBloodPressure ?? null,
    diastolicBloodPressure: input.diastolicBloodPressure ?? null,
    bloodSugar: input.bloodSugar ?? null,
    confidenceScore: input.confidenceScore ?? null,
    reflectionNote: nullableText(input.reflectionNote),
    confidencePlan: nullableText(input.confidencePlan),
    generalNote: nullableText(input.generalNote),
    activityProgress: input.activityProgress
      .map((row) => ({
        goalActivityCode: row.goalActivityCode.trim(),
        status: row.status,
        note: nullableText(row.note),
      }))
      .sort((left, right) => left.goalActivityCode.localeCompare(right.goalActivityCode)),
  };
}

function createFollowupRequestHash(
  actor: ActorContext,
  patientHospitalRelationshipId: string,
  input: NormalizedFollowupRequest,
): string {
  const canonicalPayload = {
    actorUserId: actor.userId.toLowerCase(),
    patientHospitalRelationshipId,
    ...(input.patientProgramId ? { patientProgramId: input.patientProgramId } : {}),
    appointmentId: input.appointmentId,
    sourceGoalPlanId: input.sourceGoalPlanId,
    weight: input.weight,
    waistCircumference: input.waistCircumference,
    systolicBloodPressure: input.systolicBloodPressure,
    diastolicBloodPressure: input.diastolicBloodPressure,
    bloodSugar: input.bloodSugar,
    confidenceScore: input.confidenceScore,
    reflectionNote: input.reflectionNote,
    confidencePlan: input.confidencePlan,
    generalNote: input.generalNote,
    activityProgress: input.activityProgress,
  };

  return createHash("sha256").update(JSON.stringify(canonicalPayload), "utf8").digest("hex");
}

function toSubmissionResult(
  record: FollowupSubmissionRecord | FollowupRetryRecord,
  hospitalId: string,
): FollowupSubmissionResult {
  return {
    followupId: record.id,
    patientProgramId: record.patientProgramId ?? null,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    hospitalId,
    roundNumber: record.roundNumber,
    recordedAt: record.recordedAt,
    createdAt: record.createdAt,
  };
}

function hasSameCreateRequestIdentity(
  existing: FollowupRetryRecord,
  actor: ActorContext,
  patientHospitalRelationshipId: string,
  submissionRequestHash: string,
  patientProgramId: string | null = null,
): boolean {
  return (
    existing.patientHospitalRelationshipId === patientHospitalRelationshipId &&
    (existing.patientProgramId ?? null) === patientProgramId &&
    existing.createdByUserId === actor.userId &&
    existing.submissionRequestHash === submissionRequestHash
  );
}

async function assertCompletedAppointment(
  transaction: Prisma.TransactionClient,
  patientHospitalRelationshipId: string,
  appointmentId: string,
): Promise<void> {
  const appointment = await transaction.patientAppointment.findFirst({
    where: {
      id: appointmentId,
      patientHospitalRelationshipId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!appointment || appointment.status !== AppointmentStatus.COMPLETED) {
    throw new ConflictError("The selected Appointment is not a completed Appointment for this patient");
  }
}

async function assertGoalActivityProgress(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: NormalizedFollowupRequest,
): Promise<void> {
  if (!input.sourceGoalPlanId) {
    if (input.activityProgress.length > 0) {
      throw new ValidationError("Goal activity progress requires a selected Goal Plan");
    }

    return;
  }

  const goalPlan = input.patientProgramId
    ? await getAccessibleGoalPlanActivityContextForProgram(
        actor,
        input.patientProgramId,
        input.sourceGoalPlanId,
        { database: transaction },
      )
    : await getAccessibleGoalPlanActivityContext(
        actor,
        input.patientHospitalRelationshipId,
        input.sourceGoalPlanId,
        { database: transaction },
      );
  const allowedActivityCodes = new Set(goalPlan.items.map((item) => item.activityCode));

  for (const progress of input.activityProgress) {
    if (!allowedActivityCodes.has(progress.goalActivityCode)) {
      throw new ValidationError("Follow-up progress contains an activity outside the selected Goal Plan");
    }
  }
}

async function createInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: FollowupCreateRequest,
  now: Date,
  patientProgramId: string | null = null,
  programAccessOverride?: PatientProgramAccessContext,
): Promise<FollowupSubmissionResult> {
  const normalizedInput = normalizeFollowupInput(input, patientProgramId);
  const programAccess = normalizedInput.patientProgramId
    ? programAccessOverride ??
      (await resolvePatientProgramByIdAccessContext(
        actor,
        normalizedInput.patientProgramId,
        PATIENT_PROGRAM_MANAGE_CAPABILITY,
        transaction,
      ))
    : null;
  let authoritativeActor = programAccess?.actor ?? actor;
  const normalized = programAccess
    ? {
        ...normalizedInput,
        patientHospitalRelationshipId: programAccess.patient.patientHospitalRelationshipId,
      }
    : normalizedInput;
  let access = await resolveFollowupAccessContext(
    authoritativeActor,
    normalized.patientHospitalRelationshipId,
    FOLLOWUP_RECORD_CAPABILITY,
    transaction,
  );
  const submissionRequestHash = createFollowupRequestHash(
    authoritativeActor,
    access.patient.patientHospitalRelationshipId,
    normalized,
  );

  const existing = await transaction.patientFollowup.findUnique({
    where: { submissionNonce: normalized.submissionNonce },
    select: followupRetrySelect,
  });

  if (existing) {
    if (
      !hasSameCreateRequestIdentity(
        existing,
        authoritativeActor,
        access.patient.patientHospitalRelationshipId,
        submissionRequestHash,
        normalized.patientProgramId,
      )
    ) {
      throw new ConflictError("This Follow-up submission token has already been used");
    }

    return toSubmissionResult(existing, access.target.hospitalId);
  }

  if (normalized.appointmentId) {
    await assertCompletedAppointment(
      transaction,
      access.patient.patientHospitalRelationshipId,
      normalized.appointmentId,
    );
  }

  await assertGoalActivityProgress(transaction, authoritativeActor, normalized);

  if (normalized.patientProgramId) {
    const locked = await lockActivePatientProgram(
      transaction,
      actor,
      normalized.patientProgramId,
    );
    access = await resolveFollowupAccessContext(
      actor,
      locked.access.patient.patientHospitalRelationshipId,
      FOLLOWUP_RECORD_CAPABILITY,
      transaction,
    );
    authoritativeActor = locked.access.actor;
  }

  const latest = await transaction.patientFollowup.findFirst({
    where: normalized.patientProgramId
      ? { patientProgramId: normalized.patientProgramId }
      : {
          patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          patientProgramId: null,
        },
    orderBy: [{ roundNumber: "desc" }],
    select: { roundNumber: true },
  });
  const roundNumber = (latest?.roundNumber ?? 0) + 1;

  const followup = await transaction.patientFollowup.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      patientProgramId: normalized.patientProgramId,
      appointmentId: normalized.appointmentId,
      sourceGoalPlanId: normalized.sourceGoalPlanId,
      createdByUserId: authoritativeActor.userId,
      roundNumber,
      submissionNonce: normalized.submissionNonce,
      submissionRequestHash,
      recordedAt: now,
      weight: normalized.weight,
      waistCircumference: normalized.waistCircumference,
      systolicBloodPressure: normalized.systolicBloodPressure,
      diastolicBloodPressure: normalized.diastolicBloodPressure,
      bloodSugar: normalized.bloodSugar,
      confidenceScore: normalized.confidenceScore,
      reflectionNote: normalized.reflectionNote,
      confidencePlan: normalized.confidencePlan,
      generalNote: normalized.generalNote,
      createdAt: now,
      ...(normalized.activityProgress.length > 0
        ? {
            activityProgress: {
              create: normalized.activityProgress.map((progress) => ({
                goalActivityCode: progress.goalActivityCode,
                status: progress.status,
                note: progress.note,
                createdAt: now,
              })),
            },
          }
        : {}),
    },
    select: followupSubmissionSelect,
  });

  await recordAuditEvent(
    {
      actorUserId: authoritativeActor.userId,
      action: "followup.created",
      resourceType: "PatientFollowup",
      resourceId: followup.id,
      metadata: {
        followupId: followup.id,
        ...(normalized.patientProgramId
          ? { patientProgramId: normalized.patientProgramId }
          : {}),
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        roundNumber: followup.roundNumber,
        ...(normalized.appointmentId ? { appointmentId: normalized.appointmentId } : {}),
        ...(normalized.sourceGoalPlanId ? { sourceGoalPlanId: normalized.sourceGoalPlanId } : {}),
      },
    },
    transaction,
  );

  return toSubmissionResult(followup, access.target.hospitalId);
}

function toRelationshipFollowupInput(
  input: FollowupProgramCreateRequest,
  patientHospitalRelationshipId: string,
): FollowupCreateRequest {
  const { patientProgramId, ...payload } = input;
  void patientProgramId;

  return {
    patientHospitalRelationshipId,
    ...payload,
  };
}

export async function createFollowup(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: FollowupServiceDependencies = {},
): Promise<FollowupSubmissionResult> {
  const parsed = followupCreateRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Follow-up submission data is invalid");
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

export async function createFollowupForProgram(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: FollowupServiceDependencies = {},
): Promise<FollowupSubmissionResult> {
  const parsed = followupProgramCreateRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Program Follow-up submission data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        const programAccess = await resolvePatientProgramByIdAccessContext(
          actor,
          parsed.data.patientProgramId.toLowerCase(),
          PATIENT_PROGRAM_MANAGE_CAPABILITY,
          transaction,
        );

        return createInTransaction(
          transaction,
          actor,
          toRelationshipFollowupInput(
            parsed.data,
            programAccess.patient.patientHospitalRelationshipId,
          ),
          getNow(dependencies),
          parsed.data.patientProgramId,
          programAccess,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const followupServiceInternals = {
  assertCompletedAppointment,
  assertGoalActivityProgress,
  createFollowupRequestHash,
  createInTransaction,
  hasSameCreateRequestIdentity,
  isRetryableTransactionError,
  normalizeDatabaseError,
  normalizeFollowupInput,
  runSerializable,
  toRelationshipFollowupInput,
};
