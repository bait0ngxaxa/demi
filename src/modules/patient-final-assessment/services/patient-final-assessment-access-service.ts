import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
  PATIENT_PROGRAM_READ_CAPABILITY,
  type PatientProgramCapability,
} from "@/modules/patient-program/policies/patient-program-policy";
import {
  resolvePatientProgramByIdAccessContext,
  type PatientProgramAccessContext,
} from "@/modules/patient-program/services/patient-program-access-service";
import {
  patientProgramIdSchema,
  patientProgramRelationshipIdSchema,
} from "@/modules/patient-program/schemas/patient-program-schemas";
import { NotFoundError } from "@/shared/errors/application-error";

export type PatientFinalAssessmentAccessDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientFinalAssessmentAccessContext = PatientProgramAccessContext & {
  patientProgramId: string;
};

function getNormalizedUuid(value: unknown, schema: typeof patientProgramIdSchema): string {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new NotFoundError();
  }

  return parsed.data.toLowerCase();
}

export async function resolvePatientFinalAssessmentAccessContext(
  actor: ActorContext | null | undefined,
  patientProgramId: unknown,
  capability: PatientProgramCapability,
  expectedRelationshipId: unknown,
  database?: PatientFinalAssessmentAccessDatabase,
): Promise<PatientFinalAssessmentAccessContext> {
  const normalizedProgramId = getNormalizedUuid(patientProgramId, patientProgramIdSchema);
  const normalizedExpectedRelationshipId = getNormalizedUuid(
    expectedRelationshipId,
    patientProgramRelationshipIdSchema,
  );
  const access = await resolvePatientProgramByIdAccessContext(
    actor,
    normalizedProgramId,
    capability,
    database,
  );

  if (access.patient.patientHospitalRelationshipId !== normalizedExpectedRelationshipId) {
    throw new NotFoundError();
  }

  return {
    ...access,
    patientProgramId: normalizedProgramId,
  };
}

export const patientFinalAssessmentAccessInternals = {
  getNormalizedUuid,
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
  PATIENT_PROGRAM_READ_CAPABILITY,
};
