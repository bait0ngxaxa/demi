import "server-only";

import {
  PatientClassificationSource as PrismaPatientClassificationSource,
  Prisma,
  type PatientClassificationType as PrismaPatientClassificationType,
} from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ConflictError, ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import { PATIENT_CLASSIFICATION_MANAGE_CAPABILITY } from "../policies/patient-classification-policy";
import type {
  PatientClassificationSource,
  PatientClassificationType,
} from "../schemas/patient-classification-schemas";
import { resolvePatientClassificationAccessContext } from "./patient-classification-access-service";

export type PatientClassificationTransactionDatabase = Prisma.TransactionClient;

export type PatientClassificationMutationOperation = "CREATED" | "CHANGED" | "NOOP";

export type PatientClassificationMutationRequest = {
  patientProfileId: string;
  patientHospitalRelationshipId: string;
  targetHospitalId: string;
  classification: PatientClassificationType;
  source: PatientClassificationSource;
  expectedCurrentClassification?: PatientClassificationType | null;
  explicitChangeConfirmation?: boolean;
};

export type PatientClassificationMutationResult = {
  operation: PatientClassificationMutationOperation;
  patientProfileId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  classification: PatientClassificationType;
  previousClassification: PatientClassificationType | null;
  changedAt: Date | null;
  changedByUserId: string;
  source: PatientClassificationSource;
  patientClassificationId: string;
  historyId: string | null;
};

export class PatientClassificationReconciliationRequiredError extends ConflictError {
  constructor(message = "Patient classification requires explicit reconciliation") {
    super(message);
    this.name = "PatientClassificationReconciliationRequiredError";
  }
}

export class PatientClassificationStaleConflictError extends ConflictError {
  constructor() {
    super("Patient classification changed after the preview");
    this.name = "PatientClassificationStaleConflictError";
  }
}

const patientClassificationMutationSelect = {
  id: true,
  patientProfileId: true,
  classification: true,
  updatedByUserId: true,
} satisfies Prisma.PatientClassificationSelect;

function toPrismaClassification(value: PatientClassificationType): PrismaPatientClassificationType {
  return value as PrismaPatientClassificationType;
}

function toPrismaSource(value: PatientClassificationSource): PrismaPatientClassificationSource {
  return value as PrismaPatientClassificationSource;
}

function assertMutationTime(now: Date): void {
  if (Number.isNaN(now.getTime())) {
    throw new InfrastructureError("Patient classification time could not be resolved");
  }
}

function hasExpectedCurrentValue(input: PatientClassificationMutationRequest): boolean {
  return input.expectedCurrentClassification !== undefined;
}

export async function setPatientClassificationInTransaction(
  transaction: PatientClassificationTransactionDatabase,
  actor: ActorContext,
  input: PatientClassificationMutationRequest,
  now: Date,
): Promise<PatientClassificationMutationResult> {
  assertMutationTime(now);

  const access = await resolvePatientClassificationAccessContext(
    actor,
    input.patientHospitalRelationshipId,
    PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
    transaction,
  );

  if (
    access.patient.patientProfileId !== input.patientProfileId ||
    access.target.hospitalId !== input.targetHospitalId
  ) {
    throw new ForbiddenError();
  }

  const existing = await transaction.patientClassification.findUnique({
    where: { patientProfileId: access.patient.patientProfileId },
    select: patientClassificationMutationSelect,
  });
  const expectedProvided = hasExpectedCurrentValue(input);

  if (existing?.classification === input.classification) {
    return {
      operation: "NOOP",
      patientProfileId: access.patient.patientProfileId,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      hospitalId: access.target.hospitalId,
      classification: existing.classification,
      previousClassification: existing.classification,
      changedAt: null,
      changedByUserId: access.actor.userId,
      source: input.source,
      patientClassificationId: existing.id,
      historyId: null,
    };
  }

  if (expectedProvided && (existing?.classification ?? null) !== input.expectedCurrentClassification) {
    throw new PatientClassificationStaleConflictError();
  }

  if (existing && input.source === "ROSTER_IMPORT" && input.explicitChangeConfirmation !== true) {
    throw new PatientClassificationReconciliationRequiredError(
      "Patient classification requires explicit reconciliation",
    );
  }

  const previousClassification = existing?.classification ?? null;
  const prismaClassification = toPrismaClassification(input.classification);
  const prismaSource = toPrismaSource(input.source);
  const classification = existing
    ? await transaction.patientClassification.update({
        where: { id: existing.id },
        data: {
          classification: prismaClassification,
          updatedByUserId: access.actor.userId,
          updatedAt: now,
        },
        select: patientClassificationMutationSelect,
      })
    : await transaction.patientClassification.create({
        data: {
          patientProfileId: access.patient.patientProfileId,
          classification: prismaClassification,
          updatedByUserId: access.actor.userId,
          createdAt: now,
          updatedAt: now,
        },
        select: patientClassificationMutationSelect,
      });
  const history = await transaction.patientClassificationHistory.create({
    data: {
      patientProfileId: access.patient.patientProfileId,
      fromClassification: previousClassification as PrismaPatientClassificationType | null,
      toClassification: prismaClassification,
      changedAt: now,
      changedByUserId: access.actor.userId,
      source: prismaSource,
    },
    select: { id: true },
  });

  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: existing ? "patient_classification.changed" : "patient_classification.created",
      resourceType: "PatientClassification",
      resourceId: classification.id,
      metadata: {
        patientProfileId: access.patient.patientProfileId,
        fromClassification: previousClassification,
        toClassification: input.classification,
        source: input.source,
      },
    },
    transaction,
  );

  return {
    operation: existing ? "CHANGED" : "CREATED",
    patientProfileId: access.patient.patientProfileId,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    hospitalId: access.target.hospitalId,
    classification: classification.classification,
    previousClassification,
    changedAt: now,
    changedByUserId: access.actor.userId,
    source: input.source,
    patientClassificationId: classification.id,
    historyId: history.id,
  };
}

export const patientClassificationTransactionInternals = {
  assertMutationTime,
  hasExpectedCurrentValue,
  toPrismaClassification,
  toPrismaSource,
};
