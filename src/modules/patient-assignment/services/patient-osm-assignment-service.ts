import "server-only";

import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

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
  patientOsmAssignmentRequestSchema,
  patientOsmBulkAssignmentRequestSchema,
  patientOsmUnassignmentRequestSchema,
} from "../schemas/patient-osm-assignment-schemas";
import {
  assignOsmToPatientsInTransaction,
  type PatientOsmBulkAssignmentResult,
} from "./patient-osm-bulk-assignment-transaction";
import {
  assignOsmToPatientInTransaction,
  patientOsmAssignmentTransactionInternals,
  unassignOsmFromPatientInTransaction,
  type PatientOsmAssignmentMutationResult,
} from "./patient-osm-assignment-transaction";

export type {
  PatientOsmAssignmentMutationResult,
  PatientOsmAssignmentOperation,
} from "./patient-osm-assignment-transaction";

export type {
  PatientOsmBulkAssignmentOperation,
  PatientOsmBulkAssignmentResult,
} from "./patient-osm-bulk-assignment-transaction";

export type PatientOsmAssignmentDatabase = PrismaClient;

/**
 * Operational baseline for one batch of up to 500 assignments in a single transaction.
 * It predates the set-based rewrite and is not a benchmark-derived optimum; do not
 * shorten it without latency measurements on production-like infrastructure.
 */
const BULK_ASSIGNMENT_TRANSACTION_TIMEOUT_MS = 60_000;

export type PatientOsmAssignmentServiceDependencies = {
  database?: PatientOsmAssignmentDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

function getDatabase(
  dependencies: PatientOsmAssignmentServiceDependencies,
): PatientOsmAssignmentDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientOsmAssignmentServiceDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002")) {
    return new ConflictError("The patient assignment conflicts with another request");
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError("The patient assignment conflicted with another request");
  }

  return new InfrastructureError("Patient assignment could not be completed");
}

export async function assignOsmToPatient(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientOsmAssignmentServiceDependencies = {},
): Promise<PatientOsmAssignmentMutationResult> {
  const parsed = patientOsmAssignmentRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient assignment data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      (transaction) =>
        assignOsmToPatientInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function assignOsmToPatients(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientOsmAssignmentServiceDependencies = {},
): Promise<PatientOsmBulkAssignmentResult> {
  const parsed = patientOsmBulkAssignmentRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient bulk assignment data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      (transaction) =>
        assignOsmToPatientsInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
      { timeout: BULK_ASSIGNMENT_TRANSACTION_TIMEOUT_MS },
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function unassignOsmFromPatient(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientOsmAssignmentServiceDependencies = {},
): Promise<PatientOsmAssignmentMutationResult> {
  const parsed = patientOsmUnassignmentRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient assignment data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      (transaction) =>
        unassignOsmFromPatientInTransaction(
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

export const patientOsmAssignmentInternals = {
  assertOwnerInDatabase: patientOsmAssignmentTransactionInternals.assertOwnerInDatabase,
  assertTargetOsmInDatabase:
    patientOsmAssignmentTransactionInternals.assertTargetOsmInDatabase,
  isRetryableTransactionError: isRetryableSerializableTransactionError,
  normalizeDatabaseError,
  resolveActiveAssignment: patientOsmAssignmentTransactionInternals.resolveActiveAssignment,
  resolvePatientHospitalRelationship:
    patientOsmAssignmentTransactionInternals.resolvePatientHospitalRelationship,
  runSerializable: runSerializableTransaction,
};
