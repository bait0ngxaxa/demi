import "server-only";

import { PatientProgramStatus, Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  resolvePatientProgramByIdAccessContext,
  type PatientProgramAccessContext,
} from "@/modules/patient-program/services/patient-program-access-service";
import {
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
  PATIENT_PROGRAM_READ_CAPABILITY,
  type PatientProgramCapability,
} from "@/modules/patient-program/policies/patient-program-policy";
import { patientProgramIdSchema } from "@/modules/patient-program/schemas/patient-program-schemas";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";
import {
  getAccessibleScreeningSummary,
  getAccessibleScreeningSummaries,
  getLatestAccessibleScreeningSummary,
  type ScreeningSummary,
} from "@/modules/screening/services/screening-query-service";

import {
  getGoalActivity,
  getGoalTemplate,
  GOAL_TEMPLATE_KEY,
  GOAL_TEMPLATE_VERSION,
  type GoalTemplate,
} from "../domain/goal-templates";
import { GOAL_PLAN_CAPABILITY, GOAL_READ_CAPABILITY } from "../policies/goal-policy";
import {
  goalPlanIdSchema,
  goalPlanRelationshipIdSchema,
} from "../schemas/goal-schemas";
import {
  resolveGoalAccessContext,
  type GoalPatientSummary,
} from "./goal-access-service";

export type GoalQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type GoalQueryDependencies = {
  database?: GoalQueryDatabase;
};

export type GoalPlanCreateDependencies = GoalQueryDependencies & {
  requestedScreeningId?: unknown;
};

export type GoalScreeningContext = ScreeningSummary;

export type GoalHistoryItem = {
  goalPlanId: string;
  patientProgramId: string | null;
  roundNumber: number;
  createdAt: Date;
  createdByDisplayName: string;
  primaryGoalCode: string;
  primaryGoalLabel: string;
  activityCount: number;
  templateKey: string;
  templateVersion: string;
  sourceScreening: GoalScreeningContext | null;
};

export type GoalPlanOverview = {
  patient: GoalPatientSummary;
  latestScreening: GoalScreeningContext | null;
  latest: GoalHistoryItem | null;
  items: GoalHistoryItem[];
};

export type GoalPlanProgramOverview = GoalPlanOverview & {
  patientProgramId: string;
};

export type GoalPlanCreateContext = {
  patient: GoalPatientSummary;
  latestScreening: GoalScreeningContext | null;
  template: GoalTemplate;
};

export type GoalPlanProgramCreateContext = GoalPlanCreateContext & {
  patientProgramId: string;
};

export type GoalPlanItemDetail = {
  goalPlanItemId: string;
  activityCode: string;
  activityLabel: string;
  targetDays: number;
  targetValue: number | null;
  targetUnit: string | null;
  sortOrder: number;
};

export type GoalPlanDetail = {
  patient: GoalPatientSummary;
  goalPlanId: string;
  patientProgramId: string | null;
  roundNumber: number;
  createdAt: Date;
  createdByDisplayName: string;
  primaryGoalCode: string;
  primaryGoalLabel: string;
  primaryGoalNote: string | null;
  weeklyNote: string | null;
  templateKey: string;
  templateVersion: string;
  sourceScreening: GoalScreeningContext | null;
  items: GoalPlanItemDetail[];
};

export type GoalPlanProgramDetail = Omit<GoalPlanDetail, "patientProgramId"> & {
  patientProgramId: string;
};

export type GoalPlanActivityReference = GoalPlanItemDetail;

export type AccessibleGoalPlanReference = {
  goalPlanId: string;
  patientProgramId: string | null;
  roundNumber: number;
  createdAt: Date;
  primaryGoalCode: string;
  primaryGoalLabel: string;
  primaryGoalNote: string | null;
  weeklyNote: string | null;
  items: GoalPlanActivityReference[];
};

const GOAL_HISTORY_LIMIT = 50;

const goalHistorySelect = {
  id: true,
  patientProgramId: true,
  roundNumber: true,
  createdAt: true,
  primaryGoalCode: true,
  templateKey: true,
  templateVersion: true,
  sourceScreeningAssessmentId: true,
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
  _count: {
    select: { items: true },
  },
} satisfies Prisma.PatientGoalPlanSelect;

const goalDetailSelect = {
  id: true,
  patientProgramId: true,
  roundNumber: true,
  createdAt: true,
  primaryGoalCode: true,
  primaryGoalNote: true,
  weeklyNote: true,
  templateKey: true,
  templateVersion: true,
  sourceScreeningAssessmentId: true,
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
  items: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      activityCode: true,
      targetDays: true,
      targetValue: true,
      targetUnit: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.PatientGoalPlanSelect;

const goalPlanReferenceSelect = {
  id: true,
  patientProgramId: true,
  roundNumber: true,
  createdAt: true,
  primaryGoalCode: true,
  primaryGoalNote: true,
  weeklyNote: true,
  templateKey: true,
  templateVersion: true,
  items: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      activityCode: true,
      targetDays: true,
      targetValue: true,
      targetUnit: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.PatientGoalPlanSelect;

type GoalHistoryRecord = Prisma.PatientGoalPlanGetPayload<{
  select: typeof goalHistorySelect;
}>;

type GoalDetailRecord = Prisma.PatientGoalPlanGetPayload<{
  select: typeof goalDetailSelect;
}>;

type GoalPlanReferenceRecord = Prisma.PatientGoalPlanGetPayload<{
  select: typeof goalPlanReferenceSelect;
}>;

function getDatabase(dependencies: GoalQueryDependencies): GoalQueryDatabase {
  return dependencies.database ?? getPrisma();
}

function toGoalPatientSummary(
  access: PatientProgramAccessContext,
): GoalPatientSummary {
  return {
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    displayName: access.patient.displayName,
    hospitalNumber: access.patient.hospitalNumber,
    hospital: access.patient.hospital,
  };
}

async function resolveGoalProgramAccess(
  actor: ActorContext | null | undefined,
  programId: unknown,
  database: GoalQueryDatabase,
  capability: PatientProgramCapability = PATIENT_PROGRAM_READ_CAPABILITY,
): Promise<PatientProgramAccessContext> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  return resolvePatientProgramByIdAccessContext(
    actor,
    parsedProgramId.data.toLowerCase(),
    capability,
    database,
  );
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

function getHistoricalTemplate(templateKey: string, templateVersion: string): GoalTemplate {
  const template = getGoalTemplate(templateKey, templateVersion);

  if (!template) {
    throw new InfrastructureError("The historical Goal Plan template is unavailable");
  }

  return template;
}

function getPrimaryGoalLabel(template: GoalTemplate, primaryGoalCode: string): string {
  const goal = template.primaryGoals.find((candidate) => candidate.code === primaryGoalCode);

  if (!goal) {
    throw new InfrastructureError("The historical primary Goal is unavailable");
  }

  return goal.label;
}

function assertHistoricalItems(template: GoalTemplate, records: Array<{ activityCode: string }>): void {
  for (const record of records) {
    if (!getGoalActivity(template, record.activityCode)) {
      throw new InfrastructureError("The historical Goal activity is unavailable");
    }
  }
}

function toHistoryItem(
  record: GoalHistoryRecord,
  sourceScreening: GoalScreeningContext | null,
): GoalHistoryItem {
  const template = getHistoricalTemplate(record.templateKey, record.templateVersion);

  return {
    goalPlanId: record.id,
    patientProgramId: record.patientProgramId ?? null,
    roundNumber: record.roundNumber,
    createdAt: record.createdAt,
    createdByDisplayName: toDisplayName(record.createdByUser.person),
    primaryGoalCode: record.primaryGoalCode,
    primaryGoalLabel: getPrimaryGoalLabel(template, record.primaryGoalCode),
    activityCount: record._count.items,
    templateKey: record.templateKey,
    templateVersion: record.templateVersion,
    sourceScreening,
  };
}

function toDetail(
  record: GoalDetailRecord,
  patient: GoalPatientSummary,
  sourceScreening: GoalScreeningContext | null,
): GoalPlanDetail {
  const template = getHistoricalTemplate(record.templateKey, record.templateVersion);
  assertHistoricalItems(template, record.items);

  return {
    patient,
    goalPlanId: record.id,
    patientProgramId: record.patientProgramId ?? null,
    roundNumber: record.roundNumber,
    createdAt: record.createdAt,
    createdByDisplayName: toDisplayName(record.createdByUser.person),
    primaryGoalCode: record.primaryGoalCode,
    primaryGoalLabel: getPrimaryGoalLabel(template, record.primaryGoalCode),
    primaryGoalNote: record.primaryGoalNote,
    weeklyNote: record.weeklyNote,
    templateKey: record.templateKey,
    templateVersion: record.templateVersion,
    sourceScreening,
    items: record.items.map((item) => {
      const activity = getGoalActivity(template, item.activityCode);

      if (!activity) {
        throw new InfrastructureError("The historical Goal activity is unavailable");
      }

      return {
        goalPlanItemId: item.id,
        activityCode: item.activityCode,
        activityLabel: activity.label,
        targetDays: item.targetDays,
        targetValue: item.targetValue,
        targetUnit: item.targetUnit,
        sortOrder: item.sortOrder,
      };
    }),
  };
}

function toGoalPlanReference(record: GoalPlanReferenceRecord): AccessibleGoalPlanReference {
  const template = getHistoricalTemplate(record.templateKey, record.templateVersion);
  assertHistoricalItems(template, record.items);

  return {
    goalPlanId: record.id,
    patientProgramId: record.patientProgramId ?? null,
    roundNumber: record.roundNumber,
    createdAt: record.createdAt,
    primaryGoalCode: record.primaryGoalCode,
    primaryGoalLabel: getPrimaryGoalLabel(template, record.primaryGoalCode),
    primaryGoalNote: record.primaryGoalNote,
    weeklyNote: record.weeklyNote,
    items: record.items.map((item) => {
      const activity = getGoalActivity(template, item.activityCode);

      if (!activity) {
        throw new InfrastructureError("The historical Goal activity is unavailable");
      }

      return {
        goalPlanItemId: item.id,
        activityCode: item.activityCode,
        activityLabel: activity.label,
        targetDays: item.targetDays,
        targetValue: item.targetValue,
        targetUnit: item.targetUnit,
        sortOrder: item.sortOrder,
      };
    }),
  };
}

async function getLatestScreening(
  actor: ActorContext | null | undefined,
  database: GoalQueryDatabase,
  relationshipId: string,
): Promise<GoalScreeningContext | null> {
  try {
    return await getLatestAccessibleScreeningSummary(actor, relationshipId, { database });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return null;
    }

    throw error;
  }
}

async function getHistoricalScreeningMap(
  actor: ActorContext | null | undefined,
  database: GoalQueryDatabase,
  relationshipId: string,
  records: GoalHistoryRecord[],
): Promise<Map<string, GoalScreeningContext>> {
  const screeningIds = [
    ...new Set(
      records
        .map((record) => record.sourceScreeningAssessmentId)
        .filter((screeningId): screeningId is string => screeningId !== null),
    ),
  ];

  if (screeningIds.length === 0) {
    return new Map();
  }

  try {
    const summaries = await getAccessibleScreeningSummaries(
      actor,
      relationshipId,
      screeningIds,
      { database },
    );

    return new Map(summaries.map((summary) => [summary.screeningAssessmentId, summary]));
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return new Map();
    }

    throw error;
  }
}

export async function getGoalPlanOverview(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<GoalPlanOverview> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalAccessContext(
      actor,
      relationshipId,
      GOAL_READ_CAPABILITY,
      database,
    );
    const records = await database.patientGoalPlan.findMany({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: GOAL_HISTORY_LIMIT,
      select: goalHistorySelect,
    });
    const latestScreening = await getLatestScreening(
      actor,
      database,
      access.patient.patientHospitalRelationshipId,
    );
    const historicalScreenings = await getHistoricalScreeningMap(
      actor,
      database,
      access.patient.patientHospitalRelationshipId,
      records,
    );
    const items = records.map((record) =>
      toHistoryItem(
        record,
        record.sourceScreeningAssessmentId
          ? historicalScreenings.get(record.sourceScreeningAssessmentId) ?? null
          : null,
      ),
    );

    return {
      patient: access.patient,
      latestScreening,
      latest: items[0] ?? null,
      items,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Goal Plan history could not be loaded");
  }
}

export async function getGoalPlanOverviewForProgram(
  actor: ActorContext | null | undefined,
  programId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<GoalPlanProgramOverview> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalProgramAccess(actor, parsedProgramId.data, database);
    const normalizedProgramId = parsedProgramId.data.toLowerCase();
    const relationshipId = access.patient.patientHospitalRelationshipId;
    const records = await database.patientGoalPlan.findMany({
      where: {
        patientProgramId: normalizedProgramId,
        patientHospitalRelationshipId: relationshipId,
      },
      orderBy: [{ roundNumber: "desc" }, { id: "desc" }],
      take: GOAL_HISTORY_LIMIT,
      select: goalHistorySelect,
    });
    const latestScreening = await getLatestScreening(actor, database, relationshipId);
    const historicalScreenings = await getHistoricalScreeningMap(
      actor,
      database,
      relationshipId,
      records,
    );
    const items = records.map((record) =>
      toHistoryItem(
        record,
        record.sourceScreeningAssessmentId
          ? historicalScreenings.get(record.sourceScreeningAssessmentId) ?? null
          : null,
      ),
    );

    return {
      patientProgramId: normalizedProgramId,
      patient: toGoalPatientSummary(access),
      latestScreening,
      latest: items[0] ?? null,
      items,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program Goal Plan history could not be loaded");
  }
}

export async function getGoalPlanCreateContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: GoalPlanCreateDependencies = {},
): Promise<GoalPlanCreateContext> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalAccessContext(
      actor,
      relationshipId,
      GOAL_PLAN_CAPABILITY,
      database,
    );
    const template = getHistoricalTemplate(GOAL_TEMPLATE_KEY, GOAL_TEMPLATE_VERSION);
    const requestedScreeningId = dependencies.requestedScreeningId;
    const latestScreening =
      requestedScreeningId === undefined || requestedScreeningId === null || requestedScreeningId === ""
        ? await getLatestScreening(
            actor,
            database,
            access.patient.patientHospitalRelationshipId,
          )
        : await getAccessibleScreeningSummary(
            actor,
            access.patient.patientHospitalRelationshipId,
            requestedScreeningId,
            { database },
          );

    return {
      patient: access.patient,
      latestScreening,
      template,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Goal Plan setup could not be loaded");
  }
}

export async function getGoalPlanDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  goalPlanId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<GoalPlanDetail> {
  const parsedRelationshipId = goalPlanRelationshipIdSchema.safeParse(relationshipId);
  const parsedGoalPlanId = goalPlanIdSchema.safeParse(goalPlanId);

  if (!parsedRelationshipId.success || !parsedGoalPlanId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalAccessContext(
      actor,
      parsedRelationshipId.data,
      GOAL_READ_CAPABILITY,
      database,
    );
    const record = await database.patientGoalPlan.findFirst({
      where: {
        id: parsedGoalPlanId.data,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: goalDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    let sourceScreening: GoalScreeningContext | null = null;

    if (record.sourceScreeningAssessmentId) {
      try {
        sourceScreening = await getAccessibleScreeningSummary(
          actor,
          parsedRelationshipId.data,
          record.sourceScreeningAssessmentId,
          { database },
        );
      } catch (error: unknown) {
        if (!(error instanceof ForbiddenError)) {
          throw error;
        }
      }
    }

    return toDetail(record, access.patient, sourceScreening);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Goal Plan detail could not be loaded");
  }
}

export async function getGoalPlanCreateContextForProgram(
  actor: ActorContext | null | undefined,
  programId: unknown,
  dependencies: GoalPlanCreateDependencies = {},
): Promise<GoalPlanProgramCreateContext> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalProgramAccess(
      actor,
      parsedProgramId.data,
      database,
      PATIENT_PROGRAM_MANAGE_CAPABILITY,
    );
    const normalizedProgramId = parsedProgramId.data.toLowerCase();
    const relationshipId = access.patient.patientHospitalRelationshipId;
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

    const template = getHistoricalTemplate(GOAL_TEMPLATE_KEY, GOAL_TEMPLATE_VERSION);
    const requestedScreeningId = dependencies.requestedScreeningId;
    const latestScreening =
      requestedScreeningId === undefined || requestedScreeningId === null || requestedScreeningId === ""
        ? await getLatestScreening(access.actor, database, relationshipId)
        : await getAccessibleScreeningSummary(
            access.actor,
            relationshipId,
            requestedScreeningId,
            { database },
          );

    return {
      patientProgramId: normalizedProgramId,
      patient: toGoalPatientSummary(access),
      latestScreening,
      template,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program Goal Plan setup could not be loaded");
  }
}

export async function getGoalPlanDetailForProgram(
  actor: ActorContext | null | undefined,
  programId: unknown,
  goalPlanId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<GoalPlanProgramDetail> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);
  const parsedGoalPlanId = goalPlanIdSchema.safeParse(goalPlanId);

  if (!parsedProgramId.success || !parsedGoalPlanId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalProgramAccess(actor, parsedProgramId.data, database);
    const normalizedProgramId = parsedProgramId.data.toLowerCase();
    const relationshipId = access.patient.patientHospitalRelationshipId;
    const record = await database.patientGoalPlan.findFirst({
      where: {
        id: parsedGoalPlanId.data,
        patientProgramId: normalizedProgramId,
        patientHospitalRelationshipId: relationshipId,
      },
      select: goalDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    let sourceScreening: GoalScreeningContext | null = null;

    if (record.sourceScreeningAssessmentId) {
      try {
        sourceScreening = await getAccessibleScreeningSummary(
          actor,
          relationshipId,
          record.sourceScreeningAssessmentId,
          { database },
        );
      } catch (error: unknown) {
        if (!(error instanceof ForbiddenError)) {
          throw error;
        }
      }
    }

    return {
      ...toDetail(record, toGoalPatientSummary(access), sourceScreening),
      patientProgramId: normalizedProgramId,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program Goal Plan detail could not be loaded");
  }
}

export async function getAccessibleGoalPlanOptions(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<AccessibleGoalPlanReference[]> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalAccessContext(
      actor,
      relationshipId,
      GOAL_READ_CAPABILITY,
      database,
    );
    const records = await database.patientGoalPlan.findMany({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: GOAL_HISTORY_LIMIT,
      select: goalPlanReferenceSelect,
    });

    return records.map(toGoalPlanReference);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Accessible Goal Plan references could not be loaded");
  }
}

export async function getAccessiblePreProgramGoalPlanOptions(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<AccessibleGoalPlanReference[]> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalAccessContext(
      actor,
      relationshipId,
      GOAL_READ_CAPABILITY,
      database,
    );
    const records = await database.patientGoalPlan.findMany({
      where: {
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        patientProgramId: null,
      },
      orderBy: [{ roundNumber: "desc" }, { id: "desc" }],
      take: GOAL_HISTORY_LIMIT,
      select: goalPlanReferenceSelect,
    });

    return records.map(toGoalPlanReference);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Pre-Program Goal Plan references could not be loaded");
  }
}

export async function getAccessibleGoalPlanOptionsForProgram(
  actor: ActorContext | null | undefined,
  programId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<AccessibleGoalPlanReference[]> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalProgramAccess(actor, parsedProgramId.data, database);
    const records = await database.patientGoalPlan.findMany({
      where: {
        patientProgramId: parsedProgramId.data.toLowerCase(),
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      orderBy: [{ roundNumber: "desc" }, { id: "desc" }],
      take: GOAL_HISTORY_LIMIT,
      select: goalPlanReferenceSelect,
    });

    return records.map(toGoalPlanReference);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program Goal Plan references could not be loaded");
  }
}

export async function getAccessibleGoalPlanActivityContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  goalPlanId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<AccessibleGoalPlanReference> {
  const parsedRelationshipId = goalPlanRelationshipIdSchema.safeParse(relationshipId);
  const parsedGoalPlanId = goalPlanIdSchema.safeParse(goalPlanId);

  if (!parsedRelationshipId.success || !parsedGoalPlanId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalAccessContext(
      actor,
      parsedRelationshipId.data,
      GOAL_READ_CAPABILITY,
      database,
    );
    const record = await database.patientGoalPlan.findFirst({
      where: {
        id: parsedGoalPlanId.data,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: goalPlanReferenceSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    return toGoalPlanReference(record);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Goal Plan context could not be loaded");
  }
}

export async function getAccessiblePreProgramGoalPlanActivityContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  goalPlanId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<AccessibleGoalPlanReference> {
  const parsedRelationshipId = goalPlanRelationshipIdSchema.safeParse(relationshipId);
  const parsedGoalPlanId = goalPlanIdSchema.safeParse(goalPlanId);

  if (!parsedRelationshipId.success || !parsedGoalPlanId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalAccessContext(
      actor,
      parsedRelationshipId.data,
      GOAL_READ_CAPABILITY,
      database,
    );
    const record = await database.patientGoalPlan.findFirst({
      where: {
        id: parsedGoalPlanId.data,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        patientProgramId: null,
      },
      select: goalPlanReferenceSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    return toGoalPlanReference(record);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Pre-Program Goal Plan context could not be loaded");
  }
}

export async function getAccessibleGoalPlanActivityContextForProgram(
  actor: ActorContext | null | undefined,
  programId: unknown,
  goalPlanId: unknown,
  dependencies: GoalQueryDependencies = {},
): Promise<AccessibleGoalPlanReference> {
  const parsedProgramId = patientProgramIdSchema.safeParse(programId);
  const parsedGoalPlanId = goalPlanIdSchema.safeParse(goalPlanId);

  if (!parsedProgramId.success || !parsedGoalPlanId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveGoalProgramAccess(actor, parsedProgramId.data, database);
    const record = await database.patientGoalPlan.findFirst({
      where: {
        id: parsedGoalPlanId.data,
        patientProgramId: parsedProgramId.data.toLowerCase(),
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: goalPlanReferenceSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    return toGoalPlanReference(record);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Program Goal Plan context could not be loaded");
  }
}

export const goalQueryInternals = {
  assertHistoricalItems,
  getHistoricalTemplate,
  getHistoricalScreeningMap,
  getLatestScreening,
  resolveGoalProgramAccess,
  getPrimaryGoalLabel,
  toDisplayName,
  toHistoryItem,
  toDetail,
  toGoalPlanReference,
  goalHistorySelect,
  goalDetailSelect,
  goalPlanReferenceSelect,
};
