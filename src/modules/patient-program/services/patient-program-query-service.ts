import "server-only";

import {
  PatientProgramStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  decidePatientProgramPolicy,
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
  PATIENT_PROGRAM_READ_CAPABILITY,
} from "../policies/patient-program-policy";
import { patientProgramIdSchema } from "../schemas/patient-program-schemas";
import {
  resolvePatientProgramAccessContext,
  type PatientProgramPatientSummary,
} from "./patient-program-access-service";
import {
  patientProgramServiceOneSelect,
  toPatientProgramServiceOneProjection,
  type PatientProgramServiceOneProjection,
} from "./patient-program-service-one-query-service";

export const PATIENT_PROGRAM_HISTORY_LIMIT = 50;

export type PatientProgramQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientProgramQueryDependencies = {
  database?: PatientProgramQueryDatabase;
};

export type PatientProgramProjection = {
  programId: string;
  patientHospitalRelationshipId: string;
  status: PatientProgramStatus;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  createdBy: {
    id: string;
    displayName: string;
  };
  initialBaseline: {
    id: string;
    recordedOn: Date;
  } | null;
};

export type PatientProgramPageContext = {
  patient: PatientProgramPatientSummary;
  active: PatientProgramProjection | null;
  history: PatientProgramProjection[];
  canOpen: boolean;
  canManage: boolean;
};

export type PatientProgramDetail = PatientProgramProjection & {
  patient: PatientProgramPatientSummary;
  canManage: boolean;
  serviceOne: PatientProgramServiceOneProjection;
};

export const patientProgramSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  createdByUser: {
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
  initialBaseline: {
    select: {
      id: true,
      recordedOn: true,
    },
  },
} satisfies Prisma.PatientProgramSelect;

export const patientProgramDetailSelect = {
  ...patientProgramSelect,
  ...patientProgramServiceOneSelect,
} satisfies Prisma.PatientProgramSelect;

type PatientProgramRecord = Prisma.PatientProgramGetPayload<{
  select: typeof patientProgramSelect;
}>;

function getDatabase(dependencies: PatientProgramQueryDependencies): PatientProgramQueryDatabase {
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

function toProjection(record: PatientProgramRecord): PatientProgramProjection {
  return {
    programId: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    createdBy: {
      id: record.createdByUser.id,
      displayName: toDisplayName(record.createdByUser.person),
    },
    initialBaseline: record.initialBaseline,
  };
}

function getCanManage(
  actor: ActorContext,
  target: Parameters<typeof decidePatientProgramPolicy>[0]["target"],
): boolean {
  return decidePatientProgramPolicy({
    actor,
    capability: PATIENT_PROGRAM_MANAGE_CAPABILITY,
    target,
  }).allowed;
}

export async function getPatientProgramPageContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientProgramQueryDependencies = {},
): Promise<PatientProgramPageContext> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolvePatientProgramAccessContext(
      actor,
      relationshipId,
      PATIENT_PROGRAM_READ_CAPABILITY,
      database,
    );
    const records = await database.patientProgram.findMany({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: PATIENT_PROGRAM_HISTORY_LIMIT,
      select: patientProgramSelect,
    });
    const history = records.map(toProjection);
    const active = history.find((program) => program.status === PatientProgramStatus.ACTIVE) ?? null;
    const canManage = getCanManage(access.actor, access.target);

    return {
      patient: access.patient,
      active,
      history,
      canOpen: canManage && active === null,
      canManage,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program history could not be loaded");
  }
}

export async function getPatientProgramDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  programId: unknown,
  dependencies: PatientProgramQueryDependencies = {},
): Promise<PatientProgramDetail> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolvePatientProgramAccessContext(
      actor,
      relationshipId,
      PATIENT_PROGRAM_READ_CAPABILITY,
      database,
    );
    const record = await database.patientProgram.findFirst({
      where: {
        id: parsedProgramId.data.toLowerCase(),
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: patientProgramDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    return {
      ...toProjection(record),
      patient: access.patient,
      canManage: getCanManage(access.actor, access.target),
      serviceOne: toPatientProgramServiceOneProjection(record),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program detail could not be loaded");
  }
}

export const patientProgramQueryInternals = {
  getCanManage,
  patientProgramDetailSelect,
  patientProgramSelect,
  toDisplayName,
  toProjection,
};
