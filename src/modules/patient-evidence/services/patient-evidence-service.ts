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
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  PATIENT_ARTIFACT_CREATE_CAPABILITY,
  canRemovePatientEvidenceArtifact,
} from "../policies/patient-evidence-policy";
import {
  normalizePatientEvidenceCreateInput,
  normalizePatientEvidenceRemoveInput,
  validatePatientEvidenceFile,
  type NormalizedPatientEvidenceCreateInput,
  type NormalizedPatientEvidenceRemoveInput,
  type ValidatedPatientEvidenceFile,
} from "../schemas/patient-evidence-schemas";
import { resolvePatientEvidenceAccessContext } from "./patient-evidence-access-service";
import { getPatientEvidenceStorage } from "../storage/supabase-patient-evidence-storage";
import {
  PatientEvidenceStorageError,
  type PatientEvidenceStorage,
} from "../storage/patient-evidence-storage";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

export type PatientEvidenceDatabase = PrismaClient;

/** Only an opaque id and a fixed category are logged: never a caption, a removal reason or patient data. */
export type PatientEvidenceOperationalErrorCategory =
  | "storage_compensation_failed"
  | "storage_compensation_skipped"
  | "storage_removal_failed";

export type PatientEvidenceOperationalError = {
  category: PatientEvidenceOperationalErrorCategory;
  artifactId: string;
};

export type PatientEvidenceServiceDependencies = {
  database?: PatientEvidenceDatabase;
  storage?: PatientEvidenceStorage;
  now?: () => Date;
  artifactIdFactory?: () => string;
  logOperationalError?: (input: PatientEvidenceOperationalError) => void;
};

export type PatientEvidenceRemoveResult = {
  artifactId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  removedAt: Date;
};

/** N4 (ADR-0034): Service 1 completeness reads the associated photo, and the activity photo cannot be replaced. */
export const PATIENT_EVIDENCE_SERVICE_ONE_ASSOCIATED_MESSAGE =
  "รูปนี้แนบเป็นหลักฐานของกิจกรรม Service 1 แล้ว จึงลบจากหน้านี้ไม่ได้";
export const PATIENT_EVIDENCE_ALREADY_REMOVED_MESSAGE = "รูปหลักฐานนี้ถูกลบไปแล้ว";
export const PATIENT_EVIDENCE_REMOVAL_CHANGED_MESSAGE = "รูปหลักฐานนี้มีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";

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

  return toInfrastructureError("patient-evidence.patient-evidence-service", error, "Patient evidence metadata could not be persisted");
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

function defaultOperationalErrorLogger(input: PatientEvidenceOperationalError): void {
  console.error("Patient evidence storage operation failed", {
    category: input.category,
    artifactId: input.artifactId,
  });
}

function logOperationalError(
  dependencies: PatientEvidenceServiceDependencies,
  input: PatientEvidenceOperationalError,
): void {
  (dependencies.logOperationalError ?? defaultOperationalErrorLogger)(input);
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
    // N5: the transaction may have committed even though the client saw an error (for example a connection lost
    // at commit). Look the row up before compensating, so a committed row never loses its object.
    let committed: PatientEvidenceMutationRecord | null;

    try {
      committed = await database.patientEvidenceArtifact.findFirst({
        where: { id: artifactId },
        select: patientEvidenceMutationSelect,
      });
    } catch {
      // Unknown outcome: a stray object is safer than a row without content.
      logOperationalError(dependencies, { category: "storage_compensation_skipped", artifactId });
      throw normalizeDatabaseError(error);
    }

    if (committed) {
      return toCreateResult(committed);
    }

    try {
      await storage.removeObject({ objectKey: storageObjectKey });
    } catch {
      logOperationalError(dependencies, { category: "storage_compensation_failed", artifactId });
    }

    throw normalizeDatabaseError(error);
  }
}

function normalizeRemovalError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError(PATIENT_EVIDENCE_REMOVAL_CHANGED_MESSAGE);
  }

  return toInfrastructureError("patient-evidence.removePatientEvidenceArtifact", error, "Patient evidence removal could not be persisted");
}

type RemovedArtifact = PatientEvidenceRemoveResult & { storageObjectKey: string };

async function removeInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: NormalizedPatientEvidenceRemoveInput,
  now: Date,
): Promise<RemovedArtifact> {
  // The same direct-only access as upload: an ended relationship, an unassigned อสม. or another Hospital is NotFound.
  const access = await resolvePatientEvidenceAccessContext(
    actor,
    input.relationshipId,
    PATIENT_ARTIFACT_CREATE_CAPABILITY,
    transaction,
  );
  const relationshipId = access.patient.patientHospitalRelationshipId;
  const artifact = await transaction.patientEvidenceArtifact.findFirst({
    where: { id: input.artifactId, patientHospitalRelationshipId: relationshipId },
    select: {
      id: true,
      storageObjectKey: true,
      createdByUserId: true,
      removedAt: true,
      serviceOneArtifactAssociation: { select: { id: true } },
    },
  });

  if (!artifact) {
    throw new NotFoundError();
  }

  if (
    !canRemovePatientEvidenceArtifact({
      actor: access.actor,
      target: access.target,
      createdByUserId: artifact.createdByUserId,
    })
  ) {
    throw new ForbiddenError();
  }

  if (artifact.removedAt !== null) {
    throw new ConflictError(PATIENT_EVIDENCE_ALREADY_REMOVED_MESSAGE);
  }

  if (artifact.serviceOneArtifactAssociation !== null) {
    throw new ConflictError(PATIENT_EVIDENCE_SERVICE_ONE_ASSOCIATED_MESSAGE);
  }

  const updated = await transaction.patientEvidenceArtifact.updateMany({
    where: { id: artifact.id, patientHospitalRelationshipId: relationshipId, removedAt: null },
    data: {
      removedAt: now,
      removedByUserId: access.actor.userId,
      removalReason: input.reason,
    },
  });

  if (updated.count !== 1) {
    throw new ConflictError(PATIENT_EVIDENCE_ALREADY_REMOVED_MESSAGE);
  }

  // The reason stays on the row only; audit metadata carries opaque ids.
  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_evidence_artifact.removed",
      resourceType: "PatientEvidenceArtifact",
      resourceId: artifact.id,
      metadata: {
        artifactId: artifact.id,
        patientHospitalRelationshipId: relationshipId,
        hospitalId: access.target.hospitalId,
      },
    },
    transaction,
  );

  return {
    artifactId: artifact.id,
    patientHospitalRelationshipId: relationshipId,
    hospitalId: access.target.hospitalId,
    removedAt: now,
    storageObjectKey: artifact.storageObjectKey,
  };
}

/**
 * N4 (ADR-0034): soft-removes one evidence photo, then deletes its storage object. The row is kept for attribution
 * and hidden from every read path. A storage deletion failure after commit is logged and still answers success,
 * because the photo is already hidden; the leftover object is documented in ADR-0034.
 */
export async function removePatientEvidenceArtifact(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientEvidenceServiceDependencies = {},
): Promise<PatientEvidenceRemoveResult> {
  const normalized = normalizePatientEvidenceRemoveInput(input);

  if (!actor) {
    throw new ForbiddenError();
  }

  const database = getDatabase(dependencies);
  let removed: RemovedArtifact;

  try {
    removed = await database.$transaction(
      (transaction) => removeInTransaction(transaction, actor, normalized, getNow(dependencies)),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    throw normalizeRemovalError(error);
  }

  try {
    await getStorage(dependencies).removeObject({ objectKey: removed.storageObjectKey });
  } catch {
    logOperationalError(dependencies, { category: "storage_removal_failed", artifactId: removed.artifactId });
  }

  return {
    artifactId: removed.artifactId,
    patientHospitalRelationshipId: removed.patientHospitalRelationshipId,
    hospitalId: removed.hospitalId,
    removedAt: removed.removedAt,
  };
}

export const patientEvidenceServiceInternals = {
  createInTransaction,
  defaultOperationalErrorLogger,
  getObjectKey,
  isKnownRequestError,
  normalizeDatabaseError,
  normalizeRemovalError,
  removeInTransaction,
  toCreateResult,
};
