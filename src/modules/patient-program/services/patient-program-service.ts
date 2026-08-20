import "server-only";

import {
  PatientProgramStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

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
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
} from "../policies/patient-program-policy";
import {
  patientProgramCompleteRequestSchema,
  patientProgramOpenRequestSchema,
  type PatientProgramCompleteRequest,
  type PatientProgramOpenRequest,
} from "../schemas/patient-program-schemas";
import {
  resolvePatientProgramAccessContext,
  resolvePatientProgramByIdAccessContext,
} from "./patient-program-access-service";

export type PatientProgramDatabase = PrismaClient;

export type PatientProgramServiceDependencies = {
  database?: PatientProgramDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientProgramOperation = "OPENED" | "COMPLETED" | "ALREADY_COMPLETED";

export type PatientProgramMutationResult = {
  operation: PatientProgramOperation;
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  status: PatientProgramStatus;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
};

const DEFAULT_TRANSACTION_RETRIES = 2;

const patientProgramMutationSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
} satisfies Prisma.PatientProgramSelect;

type PatientProgramMutationRecord = Prisma.PatientProgramGetPayload<{
  select: typeof patientProgramMutationSelect;
}>;

function getDatabase(dependencies: PatientProgramServiceDependencies): PatientProgramDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientProgramServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Program time could not be resolved");
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

  if (isRetryableTransactionError(error)) {
    return new ConflictError("มีคำขอเปิดโปรแกรมที่ขัดแย้งกัน กรุณาเปิดหน้าใหม่แล้วลองอีกครั้ง");
  }

  if (isKnownRequestError(error, "P2003")) {
    return new ConflictError("ข้อมูลความสัมพันธ์ของโปรแกรมไม่สอดคล้องกัน");
  }

  return new InfrastructureError("Program could not be saved");
}

async function runSerializable<T>(
  database: PatientProgramDatabase,
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

function assertValidLifecycle(record: Pick<PatientProgramMutationRecord, "status" | "startedAt" | "completedAt">): void {
  const validStatusAndTimestamp =
    (record.status === PatientProgramStatus.ACTIVE && record.completedAt === null) ||
    (record.status === PatientProgramStatus.COMPLETED &&
      record.completedAt !== null &&
      record.completedAt.getTime() >= record.startedAt.getTime());

  if (!validStatusAndTimestamp) {
    throw new ConflictError("สถานะและเวลาของโปรแกรมไม่สอดคล้องกัน");
  }
}

function toMutationResult(
  record: PatientProgramMutationRecord,
  hospitalId: string,
  operation: PatientProgramOperation,
): PatientProgramMutationResult {
  return {
    operation,
    patientProgramId: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    hospitalId,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
  };
}

async function openInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientProgramOpenRequest,
  now: Date,
): Promise<PatientProgramMutationResult> {
  const access = await resolvePatientProgramAccessContext(
    actor,
    input.patientHospitalRelationshipId,
    PATIENT_PROGRAM_MANAGE_CAPABILITY,
    transaction,
  );
  const existing = await transaction.patientProgram.findFirst({
    where: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      status: PatientProgramStatus.ACTIVE,
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError("ผู้ป่วยรายนี้มีโปรแกรมที่กำลังดำเนินการอยู่แล้ว");
  }

  const baseline = await transaction.patientBaseline.findUnique({
    where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
    select: { id: true },
  });

  let initialBaselineId: string | null = null;

  if (baseline) {
    const previousUse = await transaction.patientProgram.findFirst({
      where: {
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        initialBaselineId: baseline.id,
      },
      select: { id: true },
    });

    if (!previousUse) {
      initialBaselineId = baseline.id;
    }
  }

  const program = await transaction.patientProgram.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      initialBaselineId,
      createdByUserId: access.actor.userId,
      status: PatientProgramStatus.ACTIVE,
      startedAt: now,
      createdAt: now,
    },
    select: patientProgramMutationSelect,
  });

  assertValidLifecycle(program);
  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_program.created",
      resourceType: "PatientProgram",
      resourceId: program.id,
      metadata: {
        patientProgramId: program.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        toStatus: PatientProgramStatus.ACTIVE,
      },
    },
    transaction,
  );

  return toMutationResult(program, access.target.hospitalId, "OPENED");
}

async function completeInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientProgramCompleteRequest,
  now: Date,
): Promise<PatientProgramMutationResult> {
  const normalizedProgramId = input.patientProgramId.toLowerCase();
  const access = await resolvePatientProgramByIdAccessContext(
    actor,
    normalizedProgramId,
    PATIENT_PROGRAM_MANAGE_CAPABILITY,
    transaction,
  );
  const current = await transaction.patientProgram.findFirst({
    where: {
      id: normalizedProgramId,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    },
    select: patientProgramMutationSelect,
  });

  if (!current) {
    throw new NotFoundError();
  }

  assertValidLifecycle(current);

  if (current.status === PatientProgramStatus.COMPLETED) {
    return toMutationResult(current, access.target.hospitalId, "ALREADY_COMPLETED");
  }

  if (now.getTime() < current.startedAt.getTime()) {
    throw new ConflictError("เวลาจบโปรแกรมต้องไม่มาก่อนเวลาเริ่มโปรแกรม");
  }

  const updated = await transaction.patientProgram.updateMany({
    where: {
      id: current.id,
      patientHospitalRelationshipId: current.patientHospitalRelationshipId,
      status: PatientProgramStatus.ACTIVE,
      completedAt: null,
    },
    data: {
      status: PatientProgramStatus.COMPLETED,
      completedAt: now,
    },
  });

  if (updated.count !== 1) {
    throw new ConflictError("โปรแกรมถูกเปลี่ยนสถานะแล้ว กรุณาเปิดหน้าใหม่แล้วตรวจสอบอีกครั้ง");
  }

  const completed = await transaction.patientProgram.findFirst({
    where: {
      id: current.id,
      patientHospitalRelationshipId: current.patientHospitalRelationshipId,
    },
    select: patientProgramMutationSelect,
  });

  if (!completed) {
    throw new InfrastructureError("The completed Program could not be read");
  }

  assertValidLifecycle(completed);
  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_program.completed",
      resourceType: "PatientProgram",
      resourceId: completed.id,
      metadata: {
        patientProgramId: completed.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        fromStatus: PatientProgramStatus.ACTIVE,
        toStatus: PatientProgramStatus.COMPLETED,
      },
    },
    transaction,
  );

  return toMutationResult(completed, access.target.hospitalId, "COMPLETED");
}

export async function openPatientProgram(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramServiceDependencies = {},
): Promise<PatientProgramMutationResult> {
  const parsed = patientProgramOpenRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Program opening data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => openInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function completePatientProgram(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramServiceDependencies = {},
): Promise<PatientProgramMutationResult> {
  const parsed = patientProgramCompleteRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Program completion data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => completeInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientProgramServiceInternals = {
  assertValidLifecycle,
  completeInTransaction,
  isRetryableTransactionError,
  normalizeDatabaseError,
  openInTransaction,
  runSerializable,
  toMutationResult,
};
