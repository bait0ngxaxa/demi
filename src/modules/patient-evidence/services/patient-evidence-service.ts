import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
} from "@/shared/errors/application-error";

import { PATIENT_ARTIFACT_CREATE_CAPABILITY } from "../policies/patient-evidence-policy";
import {
  normalizePatientEvidenceCreateInput,
  validatePatientEvidenceFile,
  type NormalizedPatientEvidenceCreateInput,
  type ValidatedPatientEvidenceFile,
} from "../schemas/patient-evidence-schemas";
import { resolvePatientEvidenceAccessContext } from "./patient-evidence-access-service";
import { getPatientEvidenceStorage } from "../storage/supabase-patient-evidence-storage";
import {
  PatientEvidenceStorageError,
  type PatientEvidenceStorage,
} from "../storage/patient-evidence-storage";

export type PatientEvidenceDatabase = PrismaClient;

export type PatientEvidenceServiceDependencies = {
  database?: PatientEvidenceDatabase;
  storage?: PatientEvidenceStorage;
  now?: () => Date;
  artifactIdFactory?: () => string;
  logOperationalError?: (input: {
    category: "storage_compensation_failed";
    artifactId: string;
  }) => void;
};

export type PatientEvidenceCreateResult = {
  artifactId: string;
  patientHospitalRelationshipId: string;
  mediaType: string;
  byteSize: number;
  createdAt: Date;
};

const patientEvidenceMutationSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  mediaType: true,
  byteSize: true,
  createdAt: true,
} satisfies Prisma.PatientEvidenceArtifactSelect;

type PatientEvidenceMutationRecord = Prisma.PatientEvidenceArtifactGetPayload<{
  select: typeof patientEvidenceMutationSelect;
}>;

function getDatabase(dependencies: PatientEvidenceServiceDependencies): PatientEvidenceDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientEvidenceServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Patient evidence time could not be resolved");
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

  if (isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034")) {
    return new ConflictError("หลักฐานรูปภาพนี้ไม่สามารถบันทึกซ้ำได้");
  }

  return new InfrastructureError("Patient evidence metadata could not be persisted");
}

function getStorage(dependencies: PatientEvidenceServiceDependencies): PatientEvidenceStorage {
  if (dependencies.storage) {
    return dependencies.storage;
  }

  try {
    return getPatientEvidenceStorage();
  } catch {
    throw new PatientEvidenceStorageError("upload");
  }
}

function getArtifactId(dependencies: PatientEvidenceServiceDependencies): string {
  return dependencies.artifactIdFactory ? dependencies.artifactIdFactory() : randomUUID();
}

function getObjectKey(artifactId: string): string {
  return `relationship-evidence/${artifactId}`;
}

function defaultOperationalErrorLogger(input: {
  category: "storage_compensation_failed";
  artifactId: string;
}): void {
  console.error("Patient evidence storage compensation failed", {
    category: input.category,
    artifactId: input.artifactId,
  });
}

function toCreateResult(
  record: PatientEvidenceMutationRecord,
): PatientEvidenceCreateResult {
  return {
    artifactId: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    mediaType: record.mediaType,
    byteSize: record.byteSize,
    createdAt: record.createdAt,
  };
}

async function createInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: NormalizedPatientEvidenceCreateInput,
  file: ValidatedPatientEvidenceFile,
  artifactId: string,
  storageObjectKey: string,
  now: Date,
): Promise<PatientEvidenceCreateResult> {
  const access = await resolvePatientEvidenceAccessContext(
    actor,
    input.relationshipId,
    PATIENT_ARTIFACT_CREATE_CAPABILITY,
    transaction,
  );
  const artifact = await transaction.patientEvidenceArtifact.create({
    data: {
      id: artifactId,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      storageObjectKey,
      mediaType: file.mediaType,
      byteSize: file.byteSize,
      contentSha256: file.contentSha256,
      caption: input.caption,
      createdByUserId: access.actor.userId,
      createdAt: now,
    },
    select: patientEvidenceMutationSelect,
  });

  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_evidence_artifact.created",
      resourceType: "PatientEvidenceArtifact",
      resourceId: artifact.id,
      metadata: {
        artifactId: artifact.id,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
    },
    transaction,
  );

  return toCreateResult(artifact);
}

export async function createPatientEvidenceArtifact(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientEvidenceServiceDependencies = {},
): Promise<PatientEvidenceCreateResult> {
  const normalized = normalizePatientEvidenceCreateInput(input);

  if (!actor) {
    throw new ForbiddenError();
  }

  const database = getDatabase(dependencies);
  await resolvePatientEvidenceAccessContext(
    actor,
    normalized.relationshipId,
    PATIENT_ARTIFACT_CREATE_CAPABILITY,
    database,
  );

  const file = validatePatientEvidenceFile({
    bytes: normalized.bytes,
    declaredMediaType: normalized.declaredMediaType,
  });
  const artifactId = getArtifactId(dependencies);
  const storageObjectKey = getObjectKey(artifactId);
  const storage = getStorage(dependencies);

  await storage.uploadObject({
    objectKey: storageObjectKey,
    bytes: file.bytes,
    mediaType: file.mediaType,
  });

  try {
    return await database.$transaction((transaction) =>
      createInTransaction(
        transaction,
        actor,
        normalized,
        file,
        artifactId,
        storageObjectKey,
        getNow(dependencies),
      ),
    );
  } catch (error: unknown) {
    try {
      await storage.removeObject({ objectKey: storageObjectKey });
    } catch {
      (dependencies.logOperationalError ?? defaultOperationalErrorLogger)({
        category: "storage_compensation_failed",
        artifactId,
      });
    }

    throw normalizeDatabaseError(error);
  }
}

export const patientEvidenceServiceInternals = {
  createInTransaction,
  defaultOperationalErrorLogger,
  getObjectKey,
  isKnownRequestError,
  normalizeDatabaseError,
  toCreateResult,
};
