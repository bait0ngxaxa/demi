import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getAccessibleGoalPlanActivityContext,
  getAccessibleGoalPlanOptions,
  type AccessibleGoalPlanReference,
} from "@/modules/goals/services/goal-query-service";
import {
  ApplicationError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  FOLLOWUP_HISTORY_LIMIT,
  type FollowupProgressStatus,
} from "../domain/followup-definitions";
import { FOLLOWUP_READ_CAPABILITY } from "../policies/followup-policy";
import {
  followupAppointmentIdSchema,
  followupIdSchema,
  FOLLOWUP_MAX_PROGRESS_ROWS,
  followupRelationshipIdSchema,
} from "../schemas/followup-schemas";
import {
  resolveFollowupAccessContext,
  type FollowupAccessDatabase,
  type FollowupPatientSummary,
} from "./followup-access-service";

export type FollowupQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type FollowupQueryDependencies = {
  database?: FollowupQueryDatabase;
};

export type FollowupAppointmentContext = {
  appointmentId: string;
  type: "FOLLOW_UP" | "CONSULTATION";
  scheduledAt: Date;
};

export type FollowupHistoryItem = {
  followupId: string;
  roundNumber: number;
  recordedAt: Date;
  createdByDisplayName: string;
  appointment: FollowupAppointmentContext | null;
  sourceGoalPlan: {
    goalPlanId: string;
    roundNumber: number;
  } | null;
};

export type FollowupHistory = {
  patient: FollowupPatientSummary;
  items: FollowupHistoryItem[];
  canRecord: boolean;
};

export type FollowupCreateContext = {
  patient: FollowupPatientSummary;
  appointments: FollowupAppointmentContext[];
  goalPlans: AccessibleGoalPlanReference[];
  selectedAppointmentId: string | null;
};

export type FollowupActivityProgressDetail = {
  progressId: string;
  goalActivityCode: string;
  status: FollowupProgressStatus;
  note: string | null;
};

export type FollowupDetail = {
  patient: FollowupPatientSummary;
  followupId: string;
  roundNumber: number;
  recordedAt: Date;
  createdAt: Date;
  createdByDisplayName: string;
  appointment: FollowupAppointmentContext | null;
  sourceGoalPlan: AccessibleGoalPlanReference | null;
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
  confidenceScore: number | null;
  reflectionNote: string | null;
  confidencePlan: string | null;
  generalNote: string | null;
  activityProgress: FollowupActivityProgressDetail[];
};

const followupHistorySelect = {
  id: true,
  roundNumber: true,
  recordedAt: true,
  createdByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
  appointment: {
    select: {
      id: true,
      patientHospitalRelationshipId: true,
      type: true,
      scheduledAt: true,
    },
  },
  sourceGoalPlan: {
    select: {
      id: true,
      patientHospitalRelationshipId: true,
      roundNumber: true,
    },
  },
} satisfies Prisma.PatientFollowupSelect;

const followupDetailSelect = {
  id: true,
  sourceGoalPlanId: true,
  roundNumber: true,
  recordedAt: true,
  createdAt: true,
  weight: true,
  waistCircumference: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  bloodSugar: true,
  confidenceScore: true,
  reflectionNote: true,
  confidencePlan: true,
  generalNote: true,
  createdByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
  appointment: {
    select: {
      id: true,
      patientHospitalRelationshipId: true,
      type: true,
      scheduledAt: true,
    },
  },
  activityProgress: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: FOLLOWUP_MAX_PROGRESS_ROWS,
    select: {
      id: true,
      goalActivityCode: true,
      status: true,
      note: true,
    },
  },
} satisfies Prisma.PatientFollowupSelect;

type FollowupHistoryRecord = Prisma.PatientFollowupGetPayload<{
  select: typeof followupHistorySelect;
}>;

type FollowupDetailRecord = Prisma.PatientFollowupGetPayload<{
  select: typeof followupDetailSelect;
}>;

function getDatabase(dependencies: FollowupQueryDependencies): FollowupQueryDatabase {
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

function toAppointmentContext(
  appointment: {
    id: string;
    patientHospitalRelationshipId: string;
    type: "FOLLOW_UP" | "CONSULTATION";
    scheduledAt: Date;
  } | null,
  relationshipId: string,
): FollowupAppointmentContext | null {
  return appointment && appointment.patientHospitalRelationshipId === relationshipId
    ? {
        appointmentId: appointment.id,
        type: appointment.type,
        scheduledAt: appointment.scheduledAt,
      }
    : null;
}

function toHistoryItem(record: FollowupHistoryRecord, relationshipId: string): FollowupHistoryItem {
  return {
    followupId: record.id,
    roundNumber: record.roundNumber,
    recordedAt: record.recordedAt,
    createdByDisplayName: toDisplayName(record.createdByUser.person),
    appointment: toAppointmentContext(record.appointment, relationshipId),
    sourceGoalPlan:
      record.sourceGoalPlan &&
      record.sourceGoalPlan.patientHospitalRelationshipId === relationshipId
      ? {
          goalPlanId: record.sourceGoalPlan.id,
          roundNumber: record.sourceGoalPlan.roundNumber,
        }
      : null,
  };
}

async function listCompletedAppointments(
  database: FollowupAccessDatabase,
  relationshipId: string,
): Promise<FollowupAppointmentContext[]> {
  const appointments = await database.patientAppointment.findMany({
    where: {
      patientHospitalRelationshipId: relationshipId,
      status: "COMPLETED",
    },
    orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
    take: FOLLOWUP_HISTORY_LIMIT,
    select: {
      id: true,
      patientHospitalRelationshipId: true,
      type: true,
      scheduledAt: true,
    },
  });

  return appointments.map((appointment) => toAppointmentContext(appointment, relationshipId)).filter(
    (appointment): appointment is FollowupAppointmentContext => appointment !== null,
  );
}

function toDetail(
  record: FollowupDetailRecord,
  patient: FollowupPatientSummary,
  sourceGoalPlan: AccessibleGoalPlanReference | null,
): FollowupDetail {
  return {
    patient,
    followupId: record.id,
    roundNumber: record.roundNumber,
    recordedAt: record.recordedAt,
    createdAt: record.createdAt,
    createdByDisplayName: toDisplayName(record.createdByUser.person),
    appointment: toAppointmentContext(record.appointment, patient.patientHospitalRelationshipId),
    sourceGoalPlan,
    weight: record.weight,
    waistCircumference: record.waistCircumference,
    systolicBloodPressure: record.systolicBloodPressure,
    diastolicBloodPressure: record.diastolicBloodPressure,
    bloodSugar: record.bloodSugar,
    confidenceScore: record.confidenceScore,
    reflectionNote: record.reflectionNote,
    confidencePlan: record.confidencePlan,
    generalNote: record.generalNote,
    activityProgress: record.activityProgress.map((progress) => ({
      progressId: progress.id,
      goalActivityCode: progress.goalActivityCode,
      status: progress.status,
      note: progress.note,
    })),
  };
}

export async function getFollowupHistory(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: FollowupQueryDependencies = {},
): Promise<FollowupHistory> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveFollowupAccessContext(
      actor,
      relationshipId,
      FOLLOWUP_READ_CAPABILITY,
      database,
    );
    const records = await database.patientFollowup.findMany({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      orderBy: [{ roundNumber: "desc" }, { id: "desc" }],
      take: FOLLOWUP_HISTORY_LIMIT,
      select: followupHistorySelect,
    });

    return {
      patient: access.patient,
      items: records.map((record) =>
        toHistoryItem(record, access.patient.patientHospitalRelationshipId),
      ),
      canRecord: true,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Follow-up history could not be loaded");
  }
}

export async function getFollowupCreateContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  requestedAppointmentId?: unknown,
  dependencies: FollowupQueryDependencies = {},
): Promise<FollowupCreateContext> {
  const parsedRequestedAppointmentId =
    requestedAppointmentId === undefined || requestedAppointmentId === null || requestedAppointmentId === ""
      ? null
      : followupAppointmentIdSchema.safeParse(requestedAppointmentId);

  if (parsedRequestedAppointmentId && !parsedRequestedAppointmentId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveFollowupAccessContext(
      actor,
      relationshipId,
      FOLLOWUP_READ_CAPABILITY,
      database,
    );
    const appointments = await listCompletedAppointments(
      database,
      access.patient.patientHospitalRelationshipId,
    );
    const requestedId = parsedRequestedAppointmentId
      ? parsedRequestedAppointmentId.data
      : null;

    if (requestedId && !appointments.some((appointment) => appointment.appointmentId === requestedId)) {
      throw new NotFoundError();
    }

    return {
      patient: access.patient,
      appointments,
      goalPlans: await getAccessibleGoalPlanOptions(
        actor,
        access.patient.patientHospitalRelationshipId,
        { database },
      ),
      selectedAppointmentId: requestedId,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Follow-up setup could not be loaded");
  }
}

export async function getFollowupDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  followupId: unknown,
  dependencies: FollowupQueryDependencies = {},
): Promise<FollowupDetail> {
  const parsedRelationshipId = followupRelationshipIdSchema.safeParse(relationshipId);
  const parsedFollowupId = followupIdSchema.safeParse(followupId);

  if (!parsedRelationshipId.success || !parsedFollowupId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveFollowupAccessContext(
      actor,
      parsedRelationshipId.data,
      FOLLOWUP_READ_CAPABILITY,
      database,
    );
    const record = await database.patientFollowup.findFirst({
      where: {
        id: parsedFollowupId.data,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: followupDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    const sourceGoalPlan = record.sourceGoalPlanId
      ? await getAccessibleGoalPlanActivityContext(
          actor,
          access.patient.patientHospitalRelationshipId,
          record.sourceGoalPlanId,
          { database },
        )
      : null;

    return toDetail(record, access.patient, sourceGoalPlan);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Follow-up detail could not be loaded");
  }
}

export const followupQueryInternals = {
  followupDetailSelect,
  followupHistorySelect,
  listCompletedAppointments,
  toAppointmentContext,
  toDetail,
  toDisplayName,
  toHistoryItem,
};
