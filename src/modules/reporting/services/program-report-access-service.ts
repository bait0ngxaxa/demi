import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  PATIENT_PROGRAM_READ_CAPABILITY,
} from "@/modules/patient-program/policies/patient-program-policy";
import {
  patientProgramIdSchema,
  patientProgramRelationshipIdSchema,
} from "@/modules/patient-program/schemas/patient-program-schemas";
import {
  resolvePatientProgramByIdAccessContext,
  type PatientProgramAccessContext,
} from "@/modules/patient-program/services/patient-program-access-service";
import { NotFoundError } from "@/shared/errors/application-error";

import {
  assertProgramReportPolicy,
  PROGRAM_REPORT_READ_CAPABILITY,
} from "../policies/program-report-policy";

export type ProgramReportAccessDatabase = PrismaClient | Prisma.TransactionClient;

export type ProgramReportAccessContext = PatientProgramAccessContext & {
  patientProgramId: string;
};

function normalizeUuid(value: unknown, schema: typeof patientProgramIdSchema): string {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new NotFoundError();
  }

  return parsed.data.toLowerCase();
}

export async function resolveProgramReportAccessContext(
  actor: ActorContext | null | undefined,
  patientHospitalRelationshipId: unknown,
  patientProgramId: unknown,
  database?: ProgramReportAccessDatabase,
): Promise<ProgramReportAccessContext> {
  const normalizedRelationshipId = normalizeUuid(
    patientHospitalRelationshipId,
    patientProgramRelationshipIdSchema,
  );
  const normalizedProgramId = normalizeUuid(patientProgramId, patientProgramIdSchema);

  const access = await resolvePatientProgramByIdAccessContext(
    actor,
    normalizedProgramId,
    PATIENT_PROGRAM_READ_CAPABILITY,
    database,
  );

  if (
    access.patient.patientHospitalRelationshipId.toLowerCase() !==
    normalizedRelationshipId
  ) {
    throw new NotFoundError();
  }

  assertProgramReportPolicy({
    actor: access.actor,
    capability: PROGRAM_REPORT_READ_CAPABILITY,
    target: access.target,
  });

  return {
    ...access,
    patientProgramId: normalizedProgramId,
  };
}

export const programReportAccessInternals = {
  normalizeUuid,
};
