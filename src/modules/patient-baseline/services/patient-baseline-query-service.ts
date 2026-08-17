import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
} from "@/shared/errors/application-error";

import {
  PATIENT_BASELINE_CREATE_CAPABILITY,
  PATIENT_BASELINE_READ_CAPABILITY,
} from "../policies/patient-baseline-policy";
import {
  resolvePatientBaselineAccessContext,
  type PatientBaselineAccessDatabase,
  type PatientBaselinePatientSummary,
} from "./patient-baseline-access-service";

export type { PatientBaselinePatientSummary } from "./patient-baseline-access-service";

export type PatientBaselineQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientBaselineQueryDependencies = {
  database?: PatientBaselineQueryDatabase;
};

export type PatientBaselineProjection = {
  id: string;
  patientHospitalRelationshipId: string;
  recordedOn: Date;
  recorder: {
    id: string;
    displayName: string;
  };
  measurements: {
    weight: number | null;
    waistCircumference: number | null;
    bloodPressureSystolic: number | null;
    bloodPressureDiastolic: number | null;
    bloodSugarDtx: number | null;
  };
  adaptation: {
    summary: string | null;
    obstacles: string | null;
    opportunities: string | null;
  };
  confidence: {
    score: number | null;
    improvementPlan: string | null;
  };
  summary: string | null;
  recommendations: string | null;
  createdAt: Date;
};

export type PatientBaselinePageContext = {
  patient: PatientBaselinePatientSummary;
  baseline: PatientBaselineProjection | null;
  canCreate: boolean;
};

export type PatientBaselineNavigationState = {
  baseline: { recordedOn: Date } | null;
  canCreate: boolean;
};

export const patientBaselineSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  recordedOn: true,
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
  weight: true,
  waistCircumference: true,
  bloodPressureSystolic: true,
  bloodPressureDiastolic: true,
  bloodSugarDtx: true,
  adaptationSummary: true,
  adaptationObstacles: true,
  adaptationOpportunities: true,
  confidenceScore: true,
  confidenceImprovementPlan: true,
  summary: true,
  recommendations: true,
  createdAt: true,
} satisfies Prisma.PatientBaselineSelect;

export const patientBaselineNavigationSelect = {
  recordedOn: true,
} satisfies Prisma.PatientBaselineSelect;

type PatientBaselineRecord = Prisma.PatientBaselineGetPayload<{
  select: typeof patientBaselineSelect;
}>;

type PatientBaselineNavigationRecord = Prisma.PatientBaselineGetPayload<{
  select: typeof patientBaselineNavigationSelect;
}>;

function getDatabase(dependencies: PatientBaselineQueryDependencies): PatientBaselineQueryDatabase {
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

function toProjection(record: PatientBaselineRecord): PatientBaselineProjection {
  return {
    id: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    recordedOn: record.recordedOn,
    recorder: {
      id: record.recordedBy.id,
      displayName: toDisplayName(record.recordedBy.person),
    },
    measurements: {
      weight: record.weight,
      waistCircumference: record.waistCircumference,
      bloodPressureSystolic: record.bloodPressureSystolic,
      bloodPressureDiastolic: record.bloodPressureDiastolic,
      bloodSugarDtx: record.bloodSugarDtx,
    },
    adaptation: {
      summary: record.adaptationSummary,
      obstacles: record.adaptationObstacles,
      opportunities: record.adaptationOpportunities,
    },
    confidence: {
      score: record.confidenceScore,
      improvementPlan: record.confidenceImprovementPlan,
    },
    summary: record.summary,
    recommendations: record.recommendations,
    createdAt: record.createdAt,
  };
}

async function resolveCanCreate(
  actor: ActorContext | null | undefined,
  relationshipId: string,
  database: PatientBaselineAccessDatabase,
): Promise<boolean> {
  try {
    await resolvePatientBaselineAccessContext(
      actor,
      relationshipId,
      PATIENT_BASELINE_CREATE_CAPABILITY,
      database,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return false;
    }

    throw error;
  }
}

export async function getPatientBaseline(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientBaselineQueryDependencies = {},
): Promise<PatientBaselineProjection | null> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolvePatientBaselineAccessContext(
      actor,
      relationshipId,
      PATIENT_BASELINE_READ_CAPABILITY,
      database,
    );
    const record = await database.patientBaseline.findUnique({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      select: patientBaselineSelect,
    });

    return record ? toProjection(record) : null;
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Baseline could not be loaded");
  }
}

export async function getPatientBaselinePageContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientBaselineQueryDependencies = {},
): Promise<PatientBaselinePageContext> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolvePatientBaselineAccessContext(
      actor,
      relationshipId,
      PATIENT_BASELINE_READ_CAPABILITY,
      database,
    );
    const record = await database.patientBaseline.findUnique({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      select: patientBaselineSelect,
    });

    return {
      patient: access.patient,
      baseline: record ? toProjection(record) : null,
      canCreate: await resolveCanCreate(
        actor,
        access.patient.patientHospitalRelationshipId,
        database,
      ),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Baseline page could not be loaded");
  }
}

export async function getPatientBaselineNavigationState(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientBaselineQueryDependencies = {},
): Promise<PatientBaselineNavigationState> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolvePatientBaselineAccessContext(
      actor,
      relationshipId,
      PATIENT_BASELINE_READ_CAPABILITY,
      database,
    );
    const record = await database.patientBaseline.findUnique({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      select: patientBaselineNavigationSelect,
    });

    return {
      baseline: record ? toNavigationState(record) : null,
      canCreate: await resolveCanCreate(
        actor,
        access.patient.patientHospitalRelationshipId,
        database,
      ),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Baseline navigation state could not be loaded");
  }
}

function toNavigationState(record: PatientBaselineNavigationRecord): { recordedOn: Date } {
  return { recordedOn: record.recordedOn };
}

export const patientBaselineQueryInternals = {
  patientBaselineNavigationSelect,
  patientBaselineSelect,
  resolveCanCreate,
  toDisplayName,
  toNavigationState,
  toProjection,
};
