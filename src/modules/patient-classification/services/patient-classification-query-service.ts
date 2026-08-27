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
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  decidePatientClassificationPolicy,
  PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
  PATIENT_CLASSIFICATION_READ_CAPABILITY,
} from "../policies/patient-classification-policy";
import {
  patientClassificationRelationshipIdSchema,
  type PatientClassificationSource,
  type PatientClassificationType,
} from "../schemas/patient-classification-schemas";
import {
  resolvePatientClassificationAccessContext,
  type PatientClassificationAccessDatabase,
} from "./patient-classification-access-service";

export const PATIENT_CLASSIFICATION_HISTORY_LIMIT = 50;

export type PatientClassificationQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientClassificationCurrent = {
  classification: PatientClassificationType;
  updatedAt: Date;
  updatedByDisplayName: string;
};

export type PatientClassificationHistoryItem = {
  fromClassification: PatientClassificationType | null;
  toClassification: PatientClassificationType;
  changedAt: Date;
  changedByDisplayName: string;
  source: PatientClassificationSource;
};

export type PatientClassificationPageContext = {
  patient: {
    patientHospitalRelationshipId: string;
    displayName: string;
    hospitalName: string;
  };
  current: PatientClassificationCurrent | null;
  history: PatientClassificationHistoryItem[];
  canManage: boolean;
};

export type PatientClassificationCounts = {
  total: number;
  risk: number;
  diabetes: number;
  unclassified: number;
};

function getDatabase(database?: PatientClassificationQueryDatabase): PatientClassificationQueryDatabase {
  return database ?? getPrisma();
}

function toDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ผู้ใช้งาน";
}

const patientClassificationCurrentSelect = {
  classification: true,
  updatedAt: true,
  updatedByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientClassificationSelect;

const patientClassificationHistorySelect = {
  fromClassification: true,
  toClassification: true,
  changedAt: true,
  source: true,
  changedByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientClassificationHistorySelect;

type PatientClassificationCurrentRecord = Prisma.PatientClassificationGetPayload<{
  select: typeof patientClassificationCurrentSelect;
}>;

type PatientClassificationHistoryRecord = Prisma.PatientClassificationHistoryGetPayload<{
  select: typeof patientClassificationHistorySelect;
}>;

function toCurrent(record: PatientClassificationCurrentRecord): PatientClassificationCurrent {
  return {
    classification: record.classification,
    updatedAt: record.updatedAt,
    updatedByDisplayName: toDisplayName(record.updatedByUser.person),
  };
}

function toHistoryItem(record: PatientClassificationHistoryRecord): PatientClassificationHistoryItem {
  return {
    fromClassification: record.fromClassification,
    toClassification: record.toClassification,
    changedAt: record.changedAt,
    changedByDisplayName: toDisplayName(record.changedByUser.person),
    source: record.source,
  };
}

export async function getPatientClassificationPageContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  database?: PatientClassificationAccessDatabase,
): Promise<PatientClassificationPageContext> {
  try {
    const access = await resolvePatientClassificationAccessContext(
      actor,
      relationshipId,
      PATIENT_CLASSIFICATION_READ_CAPABILITY,
      database,
    );
    const db = getDatabase(database);
    const [currentRecord, historyRecords] = await Promise.all([
      db.patientClassification.findUnique({
        where: { patientProfileId: access.patient.patientProfileId },
        select: patientClassificationCurrentSelect,
      }),
      db.patientClassificationHistory.findMany({
        where: { patientProfileId: access.patient.patientProfileId },
        orderBy: [{ changedAt: "desc" }, { id: "desc" }],
        take: PATIENT_CLASSIFICATION_HISTORY_LIMIT,
        select: patientClassificationHistorySelect,
      }),
    ]);
    const manageDecision = decidePatientClassificationPolicy({
      actor: access.actor,
      capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
      target: access.target,
    });

    return {
      patient: {
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        displayName: access.patient.displayName,
        hospitalName: access.patient.hospital.name,
      },
      current: currentRecord ? toCurrent(currentRecord) : null,
      history: historyRecords.map(toHistoryItem),
      canManage: manageDecision.allowed,
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }

    throw new InfrastructureError("Patient classification could not be loaded");
  }
}

function buildAuthorizedHospitalWhere(actorUserId: string, hospitalId: string): Prisma.HospitalWhereInput {
  return {
    id: hospitalId,
    status: HospitalStatus.ACTIVE,
    memberships: {
      some: {
        userId: actorUserId,
        membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
    },
  };
}

function buildClassificationCountWhere(
  actorUserId: string,
  hospitalId: string,
  classification?: PatientClassificationType,
): Prisma.PatientHospitalRelationshipWhereInput {
  return {
    hospitalId,
    hospital: buildAuthorizedHospitalWhere(actorUserId, hospitalId),
    patientProfile: {
      person: {
        user: { roles: { some: { role: Role.PATIENT } } },
      },
      ...(classification
        ? {
            patientClassification: {
              is: { classification },
            },
          }
        : {}),
    },
  };
}

export async function getPatientClassificationCounts(
  actor: ActorContext | null | undefined,
  targetHospitalId: unknown,
  database?: PatientClassificationQueryDatabase,
): Promise<PatientClassificationCounts> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const parsedHospitalId = patientClassificationRelationshipIdSchema.safeParse(targetHospitalId);

  if (!parsedHospitalId.success) {
    throw new ForbiddenError();
  }

  try {
    const db = getDatabase(database);
    const hospital = await db.hospital.findFirst({
      where: buildAuthorizedHospitalWhere(actor.userId, parsedHospitalId.data),
      select: { id: true },
    });

    if (!hospital) {
      throw new ForbiddenError();
    }

    const baseWhere = buildClassificationCountWhere(actor.userId, hospital.id);
    const [total, risk, diabetes] = await Promise.all([
      db.patientHospitalRelationship.count({ where: baseWhere }),
      db.patientHospitalRelationship.count({
        where: buildClassificationCountWhere(actor.userId, hospital.id, "RISK"),
      }),
      db.patientHospitalRelationship.count({
        where: buildClassificationCountWhere(actor.userId, hospital.id, "DIABETES"),
      }),
    ]);

    return {
      total,
      risk,
      diabetes,
      unclassified: Math.max(0, total - risk - diabetes),
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient classification counts could not be loaded");
  }
}

export const patientClassificationQueryInternals = {
  buildAuthorizedHospitalWhere,
  buildClassificationCountWhere,
  patientClassificationCurrentSelect,
  patientClassificationHistorySelect,
  toCurrent,
  toDisplayName,
  toHistoryItem,
};
