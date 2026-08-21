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
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  patientProgramServiceOneConfidenceRequestSchema,
  patientProgramServiceOneDreamCardRequestSchema,
  patientProgramServiceOneFloatingChartRequestSchema,
  patientProgramServiceOneArtifactAssociationRequestSchema,
  patientProgramServiceOneRoutineRequestSchema,
  type PatientProgramServiceOneActivity as PatientProgramServiceOneActivitySchema,
  type PatientProgramServiceOneArtifactActivity,
  type PatientProgramServiceOneArtifactAssociationRequest,
  type PatientProgramServiceOneConfidenceRequest,
  type PatientProgramServiceOneDreamCardRequest,
  type PatientProgramServiceOneFloatingChartRequest,
  type PatientProgramServiceOneRoutineRequest,
} from "../schemas/patient-program-service-one-schemas";
import {
  lockActivePatientProgram,
  patientProgramLifecycleSelect,
} from "./patient-program-lifecycle-service";

export type PatientProgramServiceOneDatabase = PrismaClient;

export type PatientProgramServiceOneServiceDependencies = {
  database?: PatientProgramServiceOneDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientProgramServiceOneActivity = PatientProgramServiceOneActivitySchema;

export type PatientProgramServiceOneArtifactAssociationOperation =
  | "ASSOCIATED"
  | "ALREADY_ASSOCIATED";

export type PatientProgramServiceOneOperation = "RECORDED" | "ALREADY_RECORDED";

export type PatientProgramServiceOneMutationResult = {
  activity: PatientProgramServiceOneActivity;
  operation: PatientProgramServiceOneOperation;
  recordId: string;
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  recordedByUserId: string;
  recordedAt: Date;
};

export type PatientProgramServiceOneArtifactAssociationResult = {
  activity: PatientProgramServiceOneArtifactActivity;
  operation: PatientProgramServiceOneArtifactAssociationOperation;
  associationId: string;
  artifactId: string;
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  associatedAt: Date;
};

const DEFAULT_TRANSACTION_RETRIES = 2;

const routineMutationSelect = {
  id: true,
  patientProgramId: true,
  recordedByUserId: true,
  recordedAt: true,
} satisfies Prisma.PatientProgramServiceOneRoutineSelect;

const floatingChartMutationSelect = {
  id: true,
  patientProgramId: true,
  recordedByUserId: true,
  recordedAt: true,
  summary: true,
} satisfies Prisma.PatientProgramServiceOneFloatingChartSelect;

const dreamCardMutationSelect = {
  id: true,
  patientProgramId: true,
  recordedByUserId: true,
  recordedAt: true,
  description: true,
} satisfies Prisma.PatientProgramServiceOneDreamCardSelect;

const confidenceMutationSelect = {
  id: true,
  patientProgramId: true,
  recordedByUserId: true,
  recordedAt: true,
  score: true,
  improvementPlan: true,
} satisfies Prisma.PatientProgramServiceOneConfidenceSelect;

const artifactAssociationSelect = {
  id: true,
  patientProgramId: true,
  patientHospitalRelationshipId: true,
  patientEvidenceArtifactId: true,
  routineId: true,
  floatingChartId: true,
  dreamCardId: true,
  createdAt: true,
} satisfies Prisma.PatientProgramServiceOneArtifactAssociationSelect;

function getDatabase(
  dependencies: PatientProgramServiceOneServiceDependencies,
): PatientProgramServiceOneDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientProgramServiceOneServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Service 1 time could not be resolved");
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
    return new ConflictError("กิจกรรม Service 1 ถูกบันทึกพร้อมกับคำขออื่น กรุณาตรวจสอบข้อมูลล่าสุด");
  }

  if (isKnownRequestError(error, "P2003")) {
    return new ConflictError("ข้อมูลความสัมพันธ์ของกิจกรรม Service 1 ไม่สอดคล้องกัน");
  }

  return new InfrastructureError("Service 1 could not be saved");
}

async function runSerializable<T>(
  database: PatientProgramServiceOneDatabase,
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

function toMutationResult(
  activity: PatientProgramServiceOneActivity,
  operation: PatientProgramServiceOneOperation,
  record: {
    id: string;
    patientProgramId: string;
    recordedByUserId: string;
    recordedAt: Date;
  },
  hospitalId: string,
  patientHospitalRelationshipId: string,
): PatientProgramServiceOneMutationResult {
  return {
    activity,
    operation,
    recordId: record.id,
    patientProgramId: record.patientProgramId,
    patientHospitalRelationshipId,
    hospitalId,
    recordedByUserId: record.recordedByUserId,
    recordedAt: record.recordedAt,
  };
}

async function auditRecordedActivity(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    resourceType: string;
    resourceId: string;
    activity: PatientProgramServiceOneActivity;
    patientProgramId: string;
    patientHospitalRelationshipId: string;
    hospitalId: string;
    actorUserId: string;
  },
): Promise<void> {
  await recordAuditEvent(
    {
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: {
        patientProgramId: input.patientProgramId,
        patientHospitalRelationshipId: input.patientHospitalRelationshipId,
        hospitalId: input.hospitalId,
        activity: input.activity,
      },
    },
    transaction,
  );
}

type PatientProgramServiceOneArtifactAssociationRecord = Prisma.PatientProgramServiceOneArtifactAssociationGetPayload<{
  select: typeof artifactAssociationSelect;
}>;

function getArtifactAssociationActivity(
  association: PatientProgramServiceOneArtifactAssociationRecord,
): PatientProgramServiceOneArtifactActivity {
  if (association.routineId !== null) {
    return "ROUTINE";
  }

  if (association.floatingChartId !== null) {
    return "FLOATING_CHART";
  }

  if (association.dreamCardId !== null) {
    return "DREAM_CARD";
  }

  throw new InfrastructureError("Service 1 evidence association is invalid");
}

function getActivityAssociationWhere(
  activity: PatientProgramServiceOneArtifactActivity,
  activityRecordId: string,
  patientProgramId: string,
): Prisma.PatientProgramServiceOneArtifactAssociationWhereInput {
  const base = { patientProgramId };

  switch (activity) {
    case "ROUTINE":
      return { ...base, routineId: activityRecordId };
    case "FLOATING_CHART":
      return { ...base, floatingChartId: activityRecordId };
    case "DREAM_CARD":
      return { ...base, dreamCardId: activityRecordId };
  }
}

async function findActivityRecord(
  transaction: Prisma.TransactionClient,
  activity: PatientProgramServiceOneArtifactActivity,
  patientProgramId: string,
): Promise<{ id: string } | null> {
  switch (activity) {
    case "ROUTINE":
      return transaction.patientProgramServiceOneRoutine.findUnique({
        where: { patientProgramId },
        select: { id: true },
      });
    case "FLOATING_CHART":
      return transaction.patientProgramServiceOneFloatingChart.findUnique({
        where: { patientProgramId },
        select: { id: true },
      });
    case "DREAM_CARD":
      return transaction.patientProgramServiceOneDreamCard.findUnique({
        where: { patientProgramId },
        select: { id: true },
      });
  }
}

function toArtifactAssociationResult(
  association: PatientProgramServiceOneArtifactAssociationRecord,
  activity: PatientProgramServiceOneArtifactActivity,
  operation: PatientProgramServiceOneArtifactAssociationOperation,
  hospitalId: string,
): PatientProgramServiceOneArtifactAssociationResult {
  return {
    activity,
    operation,
    associationId: association.id,
    artifactId: association.patientEvidenceArtifactId,
    patientProgramId: association.patientProgramId,
    patientHospitalRelationshipId: association.patientHospitalRelationshipId,
    hospitalId,
    associatedAt: association.createdAt,
  };
}

async function associateArtifactInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientProgramServiceOneArtifactAssociationRequest,
  now: Date,
): Promise<PatientProgramServiceOneArtifactAssociationResult> {
  const { access, program } = await lockActivePatientProgram(
    transaction,
    actor,
    input.patientProgramId.toLowerCase(),
  );
  const patientProgramId = program.id;
  const patientHospitalRelationshipId = access.patient.patientHospitalRelationshipId;
  const patientEvidenceArtifactId = input.patientEvidenceArtifactId.toLowerCase();
  const artifact = await transaction.patientEvidenceArtifact.findFirst({
    where: {
      id: patientEvidenceArtifactId,
      patientHospitalRelationshipId,
    },
    select: { id: true },
  });

  if (!artifact) {
    throw new NotFoundError();
  }

  const existingByArtifact = await transaction.patientProgramServiceOneArtifactAssociation.findFirst({
    where: {
      patientEvidenceArtifactId: artifact.id,
      patientHospitalRelationshipId,
    },
    select: artifactAssociationSelect,
  });

  if (existingByArtifact) {
    const existingActivity = getArtifactAssociationActivity(existingByArtifact);

    if (existingByArtifact.patientProgramId !== patientProgramId) {
      throw new ConflictError("หลักฐานรูปนี้ถูกผูกกับโปรแกรม Service 1 อื่นแล้ว");
    }

    if (existingActivity === input.activity) {
      return toArtifactAssociationResult(
        existingByArtifact,
        existingActivity,
        "ALREADY_ASSOCIATED",
        access.target.hospitalId,
      );
    }

    throw new ConflictError("หลักฐานรูปนี้ถูกผูกกับกิจกรรม Service 1 อื่นแล้ว");
  }

  const activityRecord = await findActivityRecord(transaction, input.activity, patientProgramId);

  if (!activityRecord) {
    throw new ConflictError("กรุณาบันทึกกิจกรรม Service 1 ก่อนแนบหลักฐานรูป");
  }

  const existingForActivity = await transaction.patientProgramServiceOneArtifactAssociation.findFirst({
    where: getActivityAssociationWhere(input.activity, activityRecord.id, patientProgramId),
    select: artifactAssociationSelect,
  });

  if (existingForActivity) {
    throw new ConflictError("กิจกรรมนี้มีหลักฐานรูปแล้วและไม่สามารถเปลี่ยนแทนในรอบนี้ได้");
  }

  const association = await transaction.patientProgramServiceOneArtifactAssociation.create({
    data: {
      patientProgramId,
      patientHospitalRelationshipId,
      patientEvidenceArtifactId: artifact.id,
      routineId: input.activity === "ROUTINE" ? activityRecord.id : null,
      floatingChartId: input.activity === "FLOATING_CHART" ? activityRecord.id : null,
      dreamCardId: input.activity === "DREAM_CARD" ? activityRecord.id : null,
      createdAt: now,
    },
    select: artifactAssociationSelect,
  });

  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_program.service_one.artifact_attached",
      resourceType: "PatientProgramServiceOneArtifactAssociation",
      resourceId: association.id,
      metadata: {
        patientProgramId,
        patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        activity: input.activity,
        artifactId: artifact.id,
      },
    },
    transaction,
  );

  return toArtifactAssociationResult(
    association,
    input.activity,
    "ASSOCIATED",
    access.target.hospitalId,
  );
}

async function recordRoutineInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientProgramServiceOneRoutineRequest,
  now: Date,
): Promise<PatientProgramServiceOneMutationResult> {
  const { access, program } = await lockActivePatientProgram(
    transaction,
    actor,
    input.patientProgramId.toLowerCase(),
  );
  const existing = await transaction.patientProgramServiceOneRoutine.findUnique({
    where: { patientProgramId: program.id },
    select: routineMutationSelect,
  });

  if (existing) {
    return toMutationResult(
      "ROUTINE",
      "ALREADY_RECORDED",
      existing,
      access.target.hospitalId,
      access.patient.patientHospitalRelationshipId,
    );
  }

  const record = await transaction.patientProgramServiceOneRoutine.create({
    data: {
      patientProgramId: program.id,
      recordedByUserId: access.actor.userId,
      recordedAt: now,
    },
    select: routineMutationSelect,
  });

  await auditRecordedActivity(transaction, {
    action: "patient_program.service_one.routine_recorded",
    resourceType: "PatientProgramServiceOneRoutine",
    resourceId: record.id,
    activity: "ROUTINE",
    patientProgramId: program.id,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    hospitalId: access.target.hospitalId,
    actorUserId: access.actor.userId,
  });

  return toMutationResult(
    "ROUTINE",
    "RECORDED",
    record,
    access.target.hospitalId,
    access.patient.patientHospitalRelationshipId,
  );
}

async function recordFloatingChartInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientProgramServiceOneFloatingChartRequest,
  now: Date,
): Promise<PatientProgramServiceOneMutationResult> {
  const { access, program } = await lockActivePatientProgram(
    transaction,
    actor,
    input.patientProgramId.toLowerCase(),
  );
  const existing = await transaction.patientProgramServiceOneFloatingChart.findUnique({
    where: { patientProgramId: program.id },
    select: floatingChartMutationSelect,
  });

  if (existing) {
    if (existing.summary !== input.summary) {
      throw new ConflictError("กราฟวัดลอยจมถูกบันทึกแล้วและไม่สามารถแก้ไขในรอบนี้ได้");
    }

    return toMutationResult(
      "FLOATING_CHART",
      "ALREADY_RECORDED",
      existing,
      access.target.hospitalId,
      access.patient.patientHospitalRelationshipId,
    );
  }

  const record = await transaction.patientProgramServiceOneFloatingChart.create({
    data: {
      patientProgramId: program.id,
      recordedByUserId: access.actor.userId,
      recordedAt: now,
      summary: input.summary,
    },
    select: floatingChartMutationSelect,
  });

  await auditRecordedActivity(transaction, {
    action: "patient_program.service_one.floating_chart_recorded",
    resourceType: "PatientProgramServiceOneFloatingChart",
    resourceId: record.id,
    activity: "FLOATING_CHART",
    patientProgramId: program.id,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    hospitalId: access.target.hospitalId,
    actorUserId: access.actor.userId,
  });

  return toMutationResult(
    "FLOATING_CHART",
    "RECORDED",
    record,
    access.target.hospitalId,
    access.patient.patientHospitalRelationshipId,
  );
}

async function recordDreamCardInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientProgramServiceOneDreamCardRequest,
  now: Date,
): Promise<PatientProgramServiceOneMutationResult> {
  const { access, program } = await lockActivePatientProgram(
    transaction,
    actor,
    input.patientProgramId.toLowerCase(),
  );
  const existing = await transaction.patientProgramServiceOneDreamCard.findUnique({
    where: { patientProgramId: program.id },
    select: dreamCardMutationSelect,
  });

  if (existing) {
    if (existing.description !== input.description) {
      throw new ConflictError("การ์ดความฝันถูกบันทึกแล้วและไม่สามารถแก้ไขในรอบนี้ได้");
    }

    return toMutationResult(
      "DREAM_CARD",
      "ALREADY_RECORDED",
      existing,
      access.target.hospitalId,
      access.patient.patientHospitalRelationshipId,
    );
  }

  const record = await transaction.patientProgramServiceOneDreamCard.create({
    data: {
      patientProgramId: program.id,
      recordedByUserId: access.actor.userId,
      recordedAt: now,
      description: input.description,
    },
    select: dreamCardMutationSelect,
  });

  await auditRecordedActivity(transaction, {
    action: "patient_program.service_one.dream_card_recorded",
    resourceType: "PatientProgramServiceOneDreamCard",
    resourceId: record.id,
    activity: "DREAM_CARD",
    patientProgramId: program.id,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    hospitalId: access.target.hospitalId,
    actorUserId: access.actor.userId,
  });

  return toMutationResult(
    "DREAM_CARD",
    "RECORDED",
    record,
    access.target.hospitalId,
    access.patient.patientHospitalRelationshipId,
  );
}

async function recordConfidenceInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientProgramServiceOneConfidenceRequest,
  now: Date,
): Promise<PatientProgramServiceOneMutationResult> {
  const { access, program } = await lockActivePatientProgram(
    transaction,
    actor,
    input.patientProgramId.toLowerCase(),
  );
  const existing = await transaction.patientProgramServiceOneConfidence.findUnique({
    where: { patientProgramId: program.id },
    select: confidenceMutationSelect,
  });

  if (existing) {
    if (existing.score !== input.score || existing.improvementPlan !== input.improvementPlan) {
      throw new ConflictError("คะแนนความมั่นใจถูกบันทึกแล้วและไม่สามารถแก้ไขในรอบนี้ได้");
    }

    return toMutationResult(
      "CONFIDENCE",
      "ALREADY_RECORDED",
      existing,
      access.target.hospitalId,
      access.patient.patientHospitalRelationshipId,
    );
  }

  const record = await transaction.patientProgramServiceOneConfidence.create({
    data: {
      patientProgramId: program.id,
      recordedByUserId: access.actor.userId,
      recordedAt: now,
      score: input.score,
      improvementPlan: input.improvementPlan,
    },
    select: confidenceMutationSelect,
  });

  await auditRecordedActivity(transaction, {
    action: "patient_program.service_one.confidence_recorded",
    resourceType: "PatientProgramServiceOneConfidence",
    resourceId: record.id,
    activity: "CONFIDENCE",
    patientProgramId: program.id,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    hospitalId: access.target.hospitalId,
    actorUserId: access.actor.userId,
  });

  return toMutationResult(
    "CONFIDENCE",
    "RECORDED",
    record,
    access.target.hospitalId,
    access.patient.patientHospitalRelationshipId,
  );
}

export async function recordPatientProgramServiceOneRoutine(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramServiceOneServiceDependencies = {},
): Promise<PatientProgramServiceOneMutationResult> {
  const parsed = patientProgramServiceOneRoutineRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Routine Service 1 data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => recordRoutineInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function recordPatientProgramServiceOneFloatingChart(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramServiceOneServiceDependencies = {},
): Promise<PatientProgramServiceOneMutationResult> {
  const parsed = patientProgramServiceOneFloatingChartRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Floating chart Service 1 data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => recordFloatingChartInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function recordPatientProgramServiceOneDreamCard(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramServiceOneServiceDependencies = {},
): Promise<PatientProgramServiceOneMutationResult> {
  const parsed = patientProgramServiceOneDreamCardRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Dream card Service 1 data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => recordDreamCardInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function recordPatientProgramServiceOneConfidence(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramServiceOneServiceDependencies = {},
): Promise<PatientProgramServiceOneMutationResult> {
  const parsed = patientProgramServiceOneConfidenceRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Confidence Service 1 data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => recordConfidenceInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function associatePatientProgramServiceOneArtifact(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramServiceOneServiceDependencies = {},
): Promise<PatientProgramServiceOneArtifactAssociationResult> {
  const parsed = patientProgramServiceOneArtifactAssociationRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Service 1 evidence association data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => associateArtifactInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientProgramServiceOneInternals = {
  artifactAssociationSelect,
  associateArtifactInTransaction,
  confidenceMutationSelect,
  findActivityRecord,
  getActivityAssociationWhere,
  getArtifactAssociationActivity,
  dreamCardMutationSelect,
  floatingChartMutationSelect,
  isRetryableTransactionError,
  lockActiveProgram: lockActivePatientProgram,
  normalizeDatabaseError,
  patientProgramLifecycleSelect,
  recordConfidenceInTransaction,
  recordDreamCardInTransaction,
  recordFloatingChartInTransaction,
  recordRoutineInTransaction,
  routineMutationSelect,
  runSerializable,
  toMutationResult,
};
