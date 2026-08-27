import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import {
  DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
  runSerializableTransaction,
} from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { PATIENT_CLASSIFICATION_MANAGE_CAPABILITY } from "../policies/patient-classification-policy";
import {
  setPatientClassificationRequestSchema,
  type SetPatientClassificationRequest,
} from "../schemas/patient-classification-schemas";
import { resolvePatientClassificationAccessContext } from "./patient-classification-access-service";
import {
  setPatientClassificationInTransaction,
  type PatientClassificationMutationResult,
} from "./patient-classification-transaction";

export type PatientClassificationServiceDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  transactionRetries?: number;
};

function getDatabase(dependencies: PatientClassificationServiceDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getMutationTime(dependencies: PatientClassificationServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Patient classification time could not be resolved");
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
    return new ConflictError("Patient classification conflicted with another request");
  }

  return new InfrastructureError("Patient classification could not be saved");
}

export async function setPatientClassification(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientClassificationServiceDependencies = {},
): Promise<PatientClassificationMutationResult> {
  const parsed = setPatientClassificationRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("ข้อมูลสถานะผู้ป่วยไม่ถูกต้อง");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  const database = getDatabase(dependencies);

  try {
    const access = await resolvePatientClassificationAccessContext(
      actor,
      parsed.data.patientHospitalRelationshipId,
      PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
      database,
    );

    return await runSerializableTransaction(
      database,
      (transaction) => {
        const now = getMutationTime(dependencies);

        return setPatientClassificationInTransaction(
          transaction,
          actor,
          {
            patientProfileId: access.patient.patientProfileId,
            patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            targetHospitalId: access.target.hospitalId,
            classification: parsed.data.classification,
            source: "MANUAL",
            explicitChangeConfirmation: true,
          },
          now,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientClassificationServiceInternals = {
  getMutationTime,
  normalizeDatabaseError,
};

export type { SetPatientClassificationRequest };
