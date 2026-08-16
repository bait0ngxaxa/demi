import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

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
import { screeningResultSchema, type ScreeningResult } from "@/modules/screening/schemas/screening-schemas";
import {
  resolveGoalAccessContext,
  type GoalPatientSummary,
} from "./goal-access-service";

export type GoalQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type GoalQueryDependencies = {
  database?: GoalQueryDatabase;
};

export type GoalScreeningContext = {
  screeningAssessmentId: string;
  submittedAt: Date;
  result: Pick<ScreeningResult, "level" | "zone">;
};

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
  sourceScreeningAssessment: {
    select: {
      id: true,
      submittedAt: true,
      result: true,
    },
  },
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
  sourceScreeningAssessment: {
    select: {
      id: true,
      submittedAt: true,
      result: true,
    },
  },
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

function parseScreeningContext(value: {
  id: string;
  submittedAt: Date;
  result: Prisma.JsonValue;
} | null): GoalScreeningContext | null {
  if (!value) {
    return null;
  }

  const parsed = screeningResultSchema.safeParse(value.result);

  if (!parsed.success) {
    throw new InfrastructureError("Persisted Screening result is invalid");
  }

  return {
    screeningAssessmentId: value.id,
    submittedAt: value.submittedAt,
    result: {
      level: parsed.data.level,
      zone: parsed.data.zone,
    },
  };
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

function toHistoryItem(record: GoalHistoryRecord): GoalHistoryItem {
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
    sourceScreening: parseScreeningContext(record.sourceScreeningAssessment),
  };
}

function toDetail(
  record: GoalDetailRecord,
  patient: GoalPatientSummary,
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
    sourceScreening: parseScreeningContext(record.sourceScreeningAssessment),
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
  database: GoalQueryDatabase,
  relationshipId: string,
): Promise<GoalScreeningContext | null> {
  const record = await database.screeningAssessment.findFirst({
    where: { patientHospitalRelationshipId: relationshipId },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      submittedAt: true,
      result: true,
    },
  });

  return parseScreeningContext(record);
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

    return {
      patient: access.patient,
      latestScreening: await getLatestScreening(
        database,
        access.patient.patientHospitalRelationshipId,
      ),
      latest: records[0] ? toHistoryItem(records[0]) : null,
      items: records.map(toHistoryItem),
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

    return {
      patient: access.patient,
      latestScreening: await getLatestScreening(
        database,
        access.patient.patientHospitalRelationshipId,
      ),
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

    return toDetail(record, access.patient);
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
  getLatestScreening,
  getPrimaryGoalLabel,
  parseScreeningContext,
  toDisplayName,
  toHistoryItem,
  toDetail,
  goalHistorySelect,
  goalDetailSelect,
};
