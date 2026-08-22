import "server-only";

import { PatientProgramStatus, Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { PATIENT_PROGRAM_READ_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import { ApplicationError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import { resolvePatientFinalAssessmentAccessContext } from "./patient-final-assessment-access-service";

export type PatientFinalAssessmentQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientFinalAssessmentQueryDependencies = {
  database?: PatientFinalAssessmentQueryDatabase;
};

export type PatientFinalAssessmentMeasurements = {
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
};

export type PatientFinalAssessmentProjection = {
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  programStatus: PatientProgramStatus;
  finalAssessment: {
    id: string;
    recordedBy: {
      id: string;
      displayName: string;
    };
    recordedAt: Date;
    createdAt: Date;
    measurements: PatientFinalAssessmentMeasurements;
  } | null;
};

const patientFinalAssessmentSelect = {
  id: true,
  patientProgramId: true,
  patientHospitalRelationshipId: true,
  recordedAt: true,
  createdAt: true,
  weight: true,
  waistCircumference: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  bloodSugar: true,
  recordedBy: {
    select: {
      id: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientFinalAssessmentSelect;

const patientFinalAssessmentProgramSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  status: true,
  finalAssessment: {
    select: patientFinalAssessmentSelect,
  },
} satisfies Prisma.PatientProgramSelect;

type PatientFinalAssessmentRecord = Prisma.PatientFinalAssessmentGetPayload<{
  select: typeof patientFinalAssessmentSelect;
}>;

type PatientFinalAssessmentProgramRecord = Prisma.PatientProgramGetPayload<{
  select: typeof patientFinalAssessmentProgramSelect;
}>;

function getDatabase(
  dependencies: PatientFinalAssessmentQueryDependencies,
): PatientFinalAssessmentQueryDatabase {
  return dependencies.database ?? getPrisma();
}

function toDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ไม่ระบุชื่อ";
}

function toProjection(
  record: PatientFinalAssessmentProgramRecord,
): PatientFinalAssessmentProjection {
  const finalAssessment: PatientFinalAssessmentRecord | null = record.finalAssessment;

  return {
    patientProgramId: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    programStatus: record.status,
    finalAssessment: finalAssessment
      ? {
          id: finalAssessment.id,
          recordedBy: {
            id: finalAssessment.recordedBy.id,
            displayName: toDisplayName(finalAssessment.recordedBy.person),
          },
          recordedAt: finalAssessment.recordedAt,
          createdAt: finalAssessment.createdAt,
          measurements: {
            weight: finalAssessment.weight,
            waistCircumference: finalAssessment.waistCircumference,
            systolicBloodPressure: finalAssessment.systolicBloodPressure,
            diastolicBloodPressure: finalAssessment.diastolicBloodPressure,
            bloodSugar: finalAssessment.bloodSugar,
          },
        }
      : null,
  };
}

export async function getPatientFinalAssessmentForProgram(
  actor: ActorContext | null | undefined,
  patientProgramId: unknown,
  expectedRelationshipId: unknown,
  dependencies: PatientFinalAssessmentQueryDependencies = {},
): Promise<PatientFinalAssessmentProjection> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolvePatientFinalAssessmentAccessContext(
      actor,
      patientProgramId,
      PATIENT_PROGRAM_READ_CAPABILITY,
      expectedRelationshipId,
      database,
    );
    const program = await database.patientProgram.findFirst({
      where: {
        id: access.patientProgramId,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: patientFinalAssessmentProgramSelect,
    });

    if (!program) {
      throw new NotFoundError();
    }

    return toProjection(program);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Final Assessment could not be loaded");
  }
}

export const getPatientFinalAssessment = getPatientFinalAssessmentForProgram;

export const patientFinalAssessmentQueryInternals = {
  patientFinalAssessmentProgramSelect,
  patientFinalAssessmentSelect,
  toDisplayName,
  toProjection,
};
