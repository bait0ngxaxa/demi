import "server-only";

import { PatientProgramStatus, Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getAccessibleGoalPlanActivityContext,
  getAccessibleGoalPlanActivityContextForProgram,
  getAccessibleGoalPlanOptionsForProgram,
  getAccessiblePreProgramGoalPlanOptions,
  type AccessibleGoalPlanReference,
} from "@/modules/goals/services/goal-query-service";
import { goalPlanIdSchema } from "@/modules/goals/schemas/goal-schemas";
import {
  resolvePatientProgramByIdAccessContext,
  type PatientProgramAccessContext,
} from "@/modules/patient-program/services/patient-program-access-service";
import { PATIENT_PROGRAM_READ_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import { patientProgramIdSchema } from "@/modules/patient-program/schemas/patient-program-schemas";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  FOLLOWUP_HISTORY_LIMIT,
  type FollowupProgressStatus,
} from "../domain/followup-definitions";
import {
  FOLLOWUP_READ_CAPABILITY,
  FOLLOWUP_RECORD_CAPABILITY,
} from "../policies/followup-policy";
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
  requestedGoalPlanId?: unknown;
};

export type FollowupAppointmentContext = {
  appointmentId: string;
  type: "FOLLOW_UP" | "CONSULTATION";
  scheduledAt: Date;
};

export type FollowupHistoryItem = {
  followupId: string;
  patientProgramId: string | null;
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

export type FollowupProgramHistory = FollowupHistory & {
  patientProgramId: string;
};

export type FollowupCreateContext = {
  patient: FollowupPatientSummary;
  appointments: FollowupAppointmentContext[];
  goalPlans: AccessibleGoalPlanReference[];
  selectedAppointmentId: string | null;
  selectedGoalPlanId: string | null;
};

export type FollowupProgramCreateContext = FollowupCreateContext & {
  patientProgramId: string;
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
  patientProgramId: string | null;
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

export type FollowupProgramDetail = Omit<FollowupDetail, "patientProgramId"> & {
  patientProgramId: string;
};

const followupHistorySelect = {
  id: true,
  patientProgramId: true,
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
      patientProgramId: true,
      roundNumber: true,
    },
  },
} satisfies Prisma.PatientFollowupSelect;

const followupDetailSelect = {
  id: true,
  patientProgramId: true,
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
    orderBy: [{ goalActivityCode: "asc" }, { id: "asc" }],
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

async function resolveFollowupProgramAccess(
  actor: ActorContext | null | undefined,
  programId: unknown,
  database: FollowupQueryDatabase,
): Promise<PatientProgramAccessContext> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  return resolvePatientProgramByIdAccessContext(
    actor,
    parsedProgramId.data.toLowerCase(),
    PATIENT_PROGRAM_READ_CAPABILITY,
    database,
  );
}

function toFollowupPatientSummary(
  access: PatientProgramAccessContext,
): FollowupPatientSummary {
  return {
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    displayName: access.patient.displayName,
    hospitalNumber: access.patient.hospitalNumber,
    hospital: access.patient.hospital,
  };
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

function toHistoryItem(
  record: FollowupHistoryRecord,
  relationshipId: string,
  patientProgramId?: string,
): FollowupHistoryItem {
  const sourceGoalPlan = record.sourceGoalPlan;
  const sourceGoalPlanMatchesScope = Boolean(
    sourceGoalPlan &&
      sourceGoalPlan.patientHospitalRelationshipId === relationshipId &&
      (patientProgramId === undefined || sourceGoalPlan.patientProgramId === patientProgramId),
  );

  return {
    followupId: record.id,
    patientProgramId: record.patientProgramId ?? null,
    roundNumber: record.roundNumber,
    recordedAt: record.recordedAt,
    createdByDisplayName: toDisplayName(record.createdByUser.person),
    appointment: toAppointmentContext(record.appointment, relationshipId),
    sourceGoalPlan: sourceGoalPlanMatchesScope && sourceGoalPlan
      ? {
          goalPlanId: sourceGoalPlan.id,
          roundNumber: sourceGoalPlan.roundNumber,
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

async function resolveRecordProjection(
  actor: ActorContext | null | undefined,
  relationshipId: string,
  database: FollowupAccessDatabase,
): Promise<boolean> {
  try {
    await resolveFollowupAccessContext(
      actor,
      relationshipId,
      FOLLOWUP_RECORD_CAPABILITY,
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

async function resolveProgramRecordProjection(
  actor: ActorContext | null | undefined,
  patientProgramId: string,
  relationshipId: string,
  database: FollowupQueryDatabase,
): Promise<boolean> {
  const program = await database.patientProgram.findFirst({
    where: {
      id: patientProgramId,
      patientHospitalRelationshipId: relationshipId,
      status: PatientProgramStatus.ACTIVE,
    },
    select: { id: true },
  });

  if (!program) {
    return false;
  }

  return resolveRecordProjection(actor, relationshipId, database);
}

async function getOptionalGoalPlanOptions(
  actor: ActorContext | null | undefined,
  relationshipId: string,
  database: FollowupQueryDatabase,
): Promise<AccessibleGoalPlanReference[]> {
  try {
    return await getAccessiblePreProgramGoalPlanOptions(actor, relationshipId, { database });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return [];
    }

    throw error;
  }
}

function toActivityProgress(
  progressRows: FollowupDetailRecord["activityProgress"],
  sourceGoalPlan: AccessibleGoalPlanReference | null,
): FollowupActivityProgressDetail[] {
  const sortOrderByActivityCode = new Map(
    sourceGoalPlan?.items.map((item) => [item.activityCode, item.sortOrder]) ?? [],
  );

  return progressRows
    .map((progress) => ({
      progressId: progress.id,
      goalActivityCode: progress.goalActivityCode,
      status: progress.status,
      note: progress.note,
    }))
    .sort((left, right) => {
      const leftSortOrder = sortOrderByActivityCode.get(left.goalActivityCode);
      const rightSortOrder = sortOrderByActivityCode.get(right.goalActivityCode);

      if (leftSortOrder !== undefined && rightSortOrder !== undefined) {
        return leftSortOrder - rightSortOrder || left.goalActivityCode.localeCompare(right.goalActivityCode);
      }

      if (leftSortOrder !== undefined) {
        return -1;
      }

      if (rightSortOrder !== undefined) {
        return 1;
      }

      return left.goalActivityCode.localeCompare(right.goalActivityCode);
    });
}

function toDetail(
  record: FollowupDetailRecord,
  patient: FollowupPatientSummary,
  sourceGoalPlan: AccessibleGoalPlanReference | null,
): FollowupDetail {
  return {
    patient,
    followupId: record.id,
    patientProgramId: record.patientProgramId ?? null,
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
    activityProgress: toActivityProgress(record.activityProgress, sourceGoalPlan),
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
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      take: FOLLOWUP_HISTORY_LIMIT,
      select: followupHistorySelect,
    });
    const canRecord = await resolveRecordProjection(
      actor,
      access.patient.patientHospitalRelationshipId,
      database,
    );

    return {
      patient: access.patient,
      items: records.map((record) =>
        toHistoryItem(record, access.patient.patientHospitalRelationshipId),
      ),
      canRecord,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Follow-up history could not be loaded");
  }
}

export async function getFollowupHistoryForProgram(
  actor: ActorContext | null | undefined,
  programId: unknown,
  dependencies: FollowupQueryDependencies = {},
): Promise<FollowupProgramHistory> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveFollowupProgramAccess(actor, parsedProgramId.data, database);
    const normalizedProgramId = parsedProgramId.data.toLowerCase();
    const relationshipId = access.patient.patientHospitalRelationshipId;
    const records = await database.patientFollowup.findMany({
      where: {
        patientProgramId: normalizedProgramId,
        patientHospitalRelationshipId: relationshipId,
      },
      orderBy: [{ roundNumber: "desc" }, { id: "desc" }],
      take: FOLLOWUP_HISTORY_LIMIT,
      select: followupHistorySelect,
    });
    const canRecord = await resolveProgramRecordProjection(
      actor,
      normalizedProgramId,
      relationshipId,
      database,
    );

    return {
      patientProgramId: normalizedProgramId,
      patient: toFollowupPatientSummary(access),
      items: records.map((record) =>
        toHistoryItem(record, relationshipId, normalizedProgramId),
      ),
      canRecord,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program Follow-up history could not be loaded");
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
      FOLLOWUP_RECORD_CAPABILITY,
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

    const goalPlans = await getOptionalGoalPlanOptions(
      actor,
      access.patient.patientHospitalRelationshipId,
      database,
    );
    const requestedGoalPlanId = dependencies.requestedGoalPlanId;
    const parsedRequestedGoalPlanId =
      requestedGoalPlanId === undefined || requestedGoalPlanId === null || requestedGoalPlanId === ""
        ? null
        : goalPlanIdSchema.safeParse(requestedGoalPlanId);
    const selectedGoalPlanId = parsedRequestedGoalPlanId
      ? parsedRequestedGoalPlanId.success
        ? goalPlans.find(({ goalPlanId }) => goalPlanId === parsedRequestedGoalPlanId.data)?.goalPlanId ?? null
        : null
      : null;

    if (requestedGoalPlanId !== undefined && requestedGoalPlanId !== null && requestedGoalPlanId !== "" && !selectedGoalPlanId) {
      throw new NotFoundError();
    }

    return {
      patient: access.patient,
      appointments,
      goalPlans,
      selectedAppointmentId: requestedId,
      selectedGoalPlanId,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Follow-up setup could not be loaded");
  }
}

export async function getFollowupCreateContextForProgram(
  actor: ActorContext | null | undefined,
  programId: unknown,
  requestedAppointmentId?: unknown,
  dependencies: FollowupQueryDependencies = {},
): Promise<FollowupProgramCreateContext> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);
  const parsedRequestedAppointmentId =
    requestedAppointmentId === undefined || requestedAppointmentId === null || requestedAppointmentId === ""
      ? null
      : followupAppointmentIdSchema.safeParse(requestedAppointmentId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  if (parsedRequestedAppointmentId && !parsedRequestedAppointmentId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const programAccess = await resolveFollowupProgramAccess(actor, parsedProgramId.data, database);
    const normalizedProgramId = parsedProgramId.data.toLowerCase();
    const relationshipId = programAccess.patient.patientHospitalRelationshipId;
    const program = await database.patientProgram.findFirst({
      where: {
        id: normalizedProgramId,
        patientHospitalRelationshipId: relationshipId,
        status: PatientProgramStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!program) {
      throw new ConflictError("The Patient Program is not active");
    }

    await resolveFollowupAccessContext(
      programAccess.actor,
      relationshipId,
      FOLLOWUP_RECORD_CAPABILITY,
      database,
    );
    const appointments = await listCompletedAppointments(database, relationshipId);
    const requestedId = parsedRequestedAppointmentId
      ? parsedRequestedAppointmentId.data
      : null;

    if (requestedId && !appointments.some((appointment) => appointment.appointmentId === requestedId)) {
      throw new NotFoundError();
    }

    let goalPlans: AccessibleGoalPlanReference[] = [];

    try {
      goalPlans = await getAccessibleGoalPlanOptionsForProgram(
        programAccess.actor,
        normalizedProgramId,
        { database },
      );
    } catch (error: unknown) {
      if (!(error instanceof ForbiddenError)) {
        throw error;
      }
    }

    const requestedGoalPlanId = dependencies.requestedGoalPlanId;
    const parsedRequestedGoalPlanId =
      requestedGoalPlanId === undefined || requestedGoalPlanId === null || requestedGoalPlanId === ""
        ? null
        : goalPlanIdSchema.safeParse(requestedGoalPlanId);
    const selectedGoalPlanId = parsedRequestedGoalPlanId
      ? parsedRequestedGoalPlanId.success
        ? goalPlans.find(({ goalPlanId }) => goalPlanId === parsedRequestedGoalPlanId.data)?.goalPlanId ?? null
        : null
      : null;

    if (
      requestedGoalPlanId !== undefined &&
      requestedGoalPlanId !== null &&
      requestedGoalPlanId !== "" &&
      !selectedGoalPlanId
    ) {
      throw new NotFoundError();
    }

    return {
      patientProgramId: normalizedProgramId,
      patient: toFollowupPatientSummary(programAccess),
      appointments,
      goalPlans,
      selectedAppointmentId: requestedId,
      selectedGoalPlanId,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program Follow-up setup could not be loaded");
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

export async function getFollowupDetailForProgram(
  actor: ActorContext | null | undefined,
  programId: unknown,
  followupId: unknown,
  dependencies: FollowupQueryDependencies = {},
): Promise<FollowupProgramDetail> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);
  const parsedFollowupId = followupIdSchema.safeParse(followupId);

  if (!parsedProgramId.success || !parsedFollowupId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveFollowupProgramAccess(actor, parsedProgramId.data, database);
    const normalizedProgramId = parsedProgramId.data.toLowerCase();
    const relationshipId = access.patient.patientHospitalRelationshipId;
    const record = await database.patientFollowup.findFirst({
      where: {
        id: parsedFollowupId.data,
        patientProgramId: normalizedProgramId,
        patientHospitalRelationshipId: relationshipId,
      },
      select: followupDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    const sourceGoalPlan = record.sourceGoalPlanId
      ? await getAccessibleGoalPlanActivityContextForProgram(
          access.actor,
          normalizedProgramId,
          record.sourceGoalPlanId,
          { database },
        )
      : null;

    return {
      ...toDetail(record, toFollowupPatientSummary(access), sourceGoalPlan),
      patientProgramId: normalizedProgramId,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program Follow-up detail could not be loaded");
  }
}

export const followupQueryInternals = {
  followupDetailSelect,
  followupHistorySelect,
  getOptionalGoalPlanOptions,
  listCompletedAppointments,
  resolveFollowupProgramAccess,
  resolveProgramRecordProjection,
  resolveRecordProjection,
  toActivityProgress,
  toAppointmentContext,
  toDetail,
  toDisplayName,
  toHistoryItem,
};
