import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import {
  DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
  isRetryableSerializableTransactionError,
  runSerializableTransaction,
} from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  patientBaselineCreateRequestSchema,
} from "../schemas/patient-baseline-schemas";
import {
  createPatientBaselineInTransaction,
  patientBaselineTransactionInternals,
  type PatientBaselineCreateResult,
} from "./patient-baseline-transaction";

export type { PatientBaselineCreateResult } from "./patient-baseline-transaction";

export type PatientBaselineDatabase = PrismaClient;

export type PatientBaselineServiceDependencies = {
  database?: PatientBaselineDatabase;
  now?: () => Date;
  transactionRetries?: number;
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
    return await runSerializableTransaction(
      getDatabase(dependencies),
      (transaction) =>
        createPatientBaselineInTransaction(
          transaction,
          actor,
          parsed.data,
          getNow(dependencies),
        ),
      dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientBaselineServiceInternals = {
  createInTransaction: createPatientBaselineInTransaction,
  isKnownRequestError,
  isRetryableTransactionError: isRetryableSerializableTransactionError,
  normalizeDatabaseError,
  normalizeInput: patientBaselineTransactionInternals.normalizeInput,
  nullableText: patientBaselineTransactionInternals.nullableText,
  runSerializable: runSerializableTransaction,
  toCreateResult: patientBaselineTransactionInternals.toCreateResult,
};
