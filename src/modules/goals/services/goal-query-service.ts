import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
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

export type GoalScreeningContext = ScreeningSummary;

export type GoalHistoryItem = {
  goalPlanId: string;
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

export type GoalPlanCreateContext = {
  patient: GoalPatientSummary;
  latestScreening: GoalScreeningContext | null;
  template: GoalTemplate;
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

const GOAL_HISTORY_LIMIT = 50;

const goalHistorySelect = {
  id: true,
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

type GoalHistoryRecord = Prisma.PatientGoalPlanGetPayload<{
  select: typeof goalHistorySelect;
}>;

type GoalDetailRecord = Prisma.PatientGoalPlanGetPayload<{
  select: typeof goalDetailSelect;
}>;

function getDatabase(dependencies: GoalQueryDependencies): GoalQueryDatabase {
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
      orderBy: [{ roundNumber: "desc" }],
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

export async function getGoalPlanCreateContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: GoalQueryDependencies = {},
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
    const latestScreening = await getLatestScreening(
      actor,
      database,
      access.patient.patientHospitalRelationshipId,
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

export const goalQueryInternals = {
  assertHistoricalItems,
  getHistoricalTemplate,
  getHistoricalScreeningMap,
  getLatestScreening,
  getPrimaryGoalLabel,
  toDisplayName,
  toHistoryItem,
  toDetail,
  goalHistorySelect,
  goalDetailSelect,
};
