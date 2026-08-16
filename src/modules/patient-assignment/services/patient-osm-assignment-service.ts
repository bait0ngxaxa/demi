import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
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
  assertPatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "../policies/patient-osm-assignment-policy";
import {
  patientOsmAssignmentRequestSchema,
  patientOsmUnassignmentRequestSchema,
  type PatientOsmAssignmentRequest,
  type PatientOsmUnassignmentRequest,
} from "../schemas/patient-osm-assignment-schemas";

export type PatientOsmAssignmentDatabase = PrismaClient;

export type PatientOsmAssignmentServiceDependencies = {
  database?: PatientOsmAssignmentDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientOsmAssignmentOperation =
  | "ASSIGNED"
  | "REASSIGNED"
  | "UNASSIGNED"
  | "NOOP";

export type PatientOsmAssignmentMutationResult = {
  operation: PatientOsmAssignmentOperation;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  assignmentId: string | null;
  osmUserId: string | null;
  previousOsmUserId: string | null;
};

const DEFAULT_TRANSACTION_RETRIES = 2;

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

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
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

async function runSerializable<T>(
  database: PatientOsmAssignmentDatabase,
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

async function assertOwnerInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  targetHospitalId: string,
): Promise<void> {
  const actor = await transaction.user.findUnique({
    where: { id: actorUserId },
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (
    actor?.status !== UserStatus.ACTIVE ||
    !actor.roles.some(({ role }) => role === Role.HOSPITAL)
  ) {
    throw new ForbiddenError();
  }

  const ownerMembership = await transaction.hospitalMembership.findFirst({
    where: {
      userId: actorUserId,
      hospitalId: targetHospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });

  if (!ownerMembership) {
    throw new ForbiddenError();
  }
}

async function resolvePatientHospitalRelationship(
  transaction: Prisma.TransactionClient,
  relationshipId: string,
): Promise<{ id: string; hospitalId: string }> {
  const relationship = await transaction.patientHospitalRelationship.findFirst({
    where: {
      id: relationshipId,
      hospital: { status: HospitalStatus.ACTIVE },
      patientProfile: {
        person: {
          user: { roles: { some: { role: Role.PATIENT } } },
        },
      },
    },
    select: { id: true, hospitalId: true },
  });

  if (!relationship) {
    throw new NotFoundError();
  }

  return relationship;
}

async function assertTargetOsmInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  osmUserId: string,
  targetHospitalId: string,
): Promise<void> {
  if (actorUserId === osmUserId) {
    throw new ForbiddenError();
  }

  const osm = await transaction.user.findFirst({
    where: {
      id: osmUserId,
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.OSM } },
      osmHospitalRelationships: {
        some: {
          hospitalId: targetHospitalId,
          status: MembershipStatus.ACTIVE,
          hospital: { status: HospitalStatus.ACTIVE },
        },
      },
    },
    select: { id: true },
  });

  if (!osm) {
    throw new ForbiddenError();
  }
}

async function resolveActiveAssignment(
  transaction: Prisma.TransactionClient,
  patientHospitalRelationshipId: string,
): Promise<{
  id: string;
  osmUserId: string;
} | null> {
  return transaction.patientOsmAssignment.findFirst({
    where: {
      patientHospitalRelationshipId,
      endedAt: null,
    },
    select: { id: true, osmUserId: true },
  });
}

async function assignInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientOsmAssignmentRequest,
  now: Date,
): Promise<PatientOsmAssignmentMutationResult> {
  const relationship = await resolvePatientHospitalRelationship(
    transaction,
    input.patientHospitalRelationshipId,
  );

  assertPatientOsmAssignmentPolicy({
    actor,
    capability: PATIENT_ASSIGN_OSM_CAPABILITY,
    targetHospitalId: relationship.hospitalId,
  });
  await assertOwnerInDatabase(transaction, actor.userId, relationship.hospitalId);
  await assertTargetOsmInDatabase(
    transaction,
    actor.userId,
    input.osmUserId,
    relationship.hospitalId,
  );

  const activeAssignment = await resolveActiveAssignment(
    transaction,
    relationship.id,
  );

  if (activeAssignment?.osmUserId === input.osmUserId) {
    return {
      operation: "NOOP",
      patientHospitalRelationshipId: relationship.id,
      hospitalId: relationship.hospitalId,
      assignmentId: activeAssignment.id,
      osmUserId: activeAssignment.osmUserId,
      previousOsmUserId: null,
    };
  }

  if (activeAssignment) {
    await transaction.patientOsmAssignment.update({
      where: { id: activeAssignment.id },
      data: {
        endedAt: now,
        endedByUserId: actor.userId,
      },
    });
  }

  const assignment = await transaction.patientOsmAssignment.create({
    data: {
      patientHospitalRelationshipId: relationship.id,
      osmUserId: input.osmUserId,
      assignedByUserId: actor.userId,
      createdAt: now,
    },
    select: { id: true, osmUserId: true },
  });

  await recordAuditEvent(
    {
      actorUserId: actor.userId,
      action: activeAssignment ? "patient.osm_reassigned" : "patient.osm_assigned",
      resourceType: "PatientOsmAssignment",
      resourceId: assignment.id,
      metadata: {
        hospitalId: relationship.hospitalId,
        patientHospitalRelationshipId: relationship.id,
        osmUserId: assignment.osmUserId,
        ...(activeAssignment ? { previousOsmUserId: activeAssignment.osmUserId } : {}),
      },
    },
    transaction,
  );

  return {
    operation: activeAssignment ? "REASSIGNED" : "ASSIGNED",
    patientHospitalRelationshipId: relationship.id,
    hospitalId: relationship.hospitalId,
    assignmentId: assignment.id,
    osmUserId: assignment.osmUserId,
    previousOsmUserId: activeAssignment?.osmUserId ?? null,
  };
}

async function unassignInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientOsmUnassignmentRequest,
  now: Date,
): Promise<PatientOsmAssignmentMutationResult> {
  const relationship = await resolvePatientHospitalRelationship(
    transaction,
    input.patientHospitalRelationshipId,
  );

  assertPatientOsmAssignmentPolicy({
    actor,
    capability: PATIENT_ASSIGN_OSM_CAPABILITY,
    targetHospitalId: relationship.hospitalId,
  });
  await assertOwnerInDatabase(transaction, actor.userId, relationship.hospitalId);

  const activeAssignment = await resolveActiveAssignment(
    transaction,
    relationship.id,
  );

  if (!activeAssignment) {
    return {
      operation: "NOOP",
      patientHospitalRelationshipId: relationship.id,
      hospitalId: relationship.hospitalId,
      assignmentId: null,
      osmUserId: null,
      previousOsmUserId: null,
    };
  }

  await transaction.patientOsmAssignment.update({
    where: { id: activeAssignment.id },
    data: {
      endedAt: now,
      endedByUserId: actor.userId,
    },
  });

  await recordAuditEvent(
    {
      actorUserId: actor.userId,
      action: "patient.osm_unassigned",
      resourceType: "PatientOsmAssignment",
      resourceId: activeAssignment.id,
      metadata: {
        hospitalId: relationship.hospitalId,
        patientHospitalRelationshipId: relationship.id,
        osmUserId: activeAssignment.osmUserId,
      },
    },
    transaction,
  );

  return {
    operation: "UNASSIGNED",
    patientHospitalRelationshipId: relationship.id,
    hospitalId: relationship.hospitalId,
    assignmentId: null,
    osmUserId: null,
    previousOsmUserId: activeAssignment.osmUserId,
  };
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
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => assignInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
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
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => unassignInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientOsmAssignmentInternals = {
  assertOwnerInDatabase,
  assertTargetOsmInDatabase,
  isRetryableTransactionError,
  normalizeDatabaseError,
  resolveActiveAssignment,
  resolvePatientHospitalRelationship,
  runSerializable,
};
