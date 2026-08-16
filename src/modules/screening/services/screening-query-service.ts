import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  getQuestionSet,
} from "../domain/question-sets";
import { getScoringDefinition } from "../domain/scoring";
import {
  SCREENING_READ_CAPABILITY,
  SCREENING_SUBMIT_CAPABILITY,
} from "../policies/screening-policy";
import {
  screeningIdSchema,
  screeningResultSchema,
  type ScreeningResponses,
  type ScreeningResult,
  screeningResponsesSchema,
} from "../schemas/screening-schemas";
import {
  resolveScreeningAccessContext,
  type ScreeningPatientSummary,
} from "./screening-access-service";

export type ScreeningQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type ScreeningQueryDependencies = {
  database?: ScreeningQueryDatabase;
};

export type ScreeningHistoryItem = {
  screeningAssessmentId: string;
  submittedAt: Date;
  status: "SUBMITTED";
  conductedByDisplayName: string;
  result: {
    pamTotal: number;
    promsTotal: number;
    level: "L1" | "L2" | "L3" | "L4";
    zone: "RED" | "YELLOW" | "GREEN";
  };
};

export type ScreeningHistory = {
  patient: ScreeningPatientSummary;
  items: ScreeningHistoryItem[];
};

export type ScreeningSummary = {
  screeningAssessmentId: string;
  submittedAt: Date;
  result: Pick<ScreeningResult, "level" | "zone">;
};

export type ScreeningDetail = {
  patient: ScreeningPatientSummary;
  screeningAssessmentId: string;
  submittedAt: Date;
  conductedByDisplayName: string;
  questionSetKey: string;
  questionSetVersion: string;
  scoringVersion: string;
  responses: ScreeningResponses;
  result: NonNullable<ReturnType<typeof screeningResultSchema.parse>>;
};

const SCREENING_HISTORY_LIMIT = 50;
const SCREENING_SUMMARY_BATCH_LIMIT = 50;

const screeningHistorySelect = {
  id: true,
  submittedAt: true,
  result: true,
  conductedByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.ScreeningAssessmentSelect;

const screeningDetailSelect = {
  ...screeningHistorySelect,
  questionSetKey: true,
  questionSetVersion: true,
  scoringVersion: true,
  responses: true,
} satisfies Prisma.ScreeningAssessmentSelect;

const screeningSummarySelect = {
  id: true,
  submittedAt: true,
  result: true,
} satisfies Prisma.ScreeningAssessmentSelect;

type ScreeningHistoryRecord = Prisma.ScreeningAssessmentGetPayload<{
  select: typeof screeningHistorySelect;
}>;

type ScreeningDetailRecord = Prisma.ScreeningAssessmentGetPayload<{
  select: typeof screeningDetailSelect;
}>;

type ScreeningSummaryRecord = Prisma.ScreeningAssessmentGetPayload<{
  select: typeof screeningSummarySelect;
}>;

function getDatabase(dependencies: ScreeningQueryDependencies): ScreeningQueryDatabase {
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

function parsePersistedResult(value: Prisma.JsonValue): NonNullable<ReturnType<typeof screeningResultSchema.parse>> {
  const parsed = screeningResultSchema.safeParse(value);

  if (!parsed.success) {
    throw new InfrastructureError("Persisted Screening result is invalid");
  }

  return parsed.data;
}

function parsePersistedResponses(value: Prisma.JsonValue): ScreeningResponses {
  const parsed = screeningResponsesSchema.safeParse(value);

  if (!parsed.success) {
    throw new InfrastructureError("Persisted Screening responses are invalid");
  }

  return parsed.data;
}

function toSummary(record: ScreeningSummaryRecord): ScreeningSummary {
  const result = parsePersistedResult(record.result);

  return {
    screeningAssessmentId: record.id,
    submittedAt: record.submittedAt,
    result: {
      level: result.level,
      zone: result.zone,
    },
  };
}

function toHistoryItem(record: ScreeningHistoryRecord): ScreeningHistoryItem {
  const result = parsePersistedResult(record.result);

  return {
    screeningAssessmentId: record.id,
    submittedAt: record.submittedAt,
    status: "SUBMITTED",
    conductedByDisplayName: toDisplayName(record.conductedByUser.person),
    result: {
      pamTotal: result.pamTotal,
      promsTotal: result.promsTotal,
      level: result.level,
      zone: result.zone,
    },
  };
}

function toDetail(
  record: ScreeningDetailRecord,
  patient: ScreeningPatientSummary,
): ScreeningDetail {
  return {
    patient,
    screeningAssessmentId: record.id,
    submittedAt: record.submittedAt,
    conductedByDisplayName: toDisplayName(record.conductedByUser.person),
    questionSetKey: record.questionSetKey,
    questionSetVersion: record.questionSetVersion,
    scoringVersion: record.scoringVersion,
    responses: parsePersistedResponses(record.responses),
    result: parsePersistedResult(record.result),
  };
}

function assertHistoricalDefinitions(detail: ScreeningDetailRecord): void {
  const questionSet = getQuestionSet(detail.questionSetKey, detail.questionSetVersion);
  const scoringDefinition = getScoringDefinition(detail.scoringVersion);

  if (!questionSet || !scoringDefinition) {
    throw new InfrastructureError("Persisted Screening definitions are unavailable");
  }
}

export async function getLatestAccessibleScreeningSummary(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: ScreeningQueryDependencies = {},
): Promise<ScreeningSummary | null> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveScreeningAccessContext(
      actor,
      relationshipId,
      SCREENING_READ_CAPABILITY,
      database,
    );
    const record = await database.screeningAssessment.findFirst({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      select: screeningSummarySelect,
    });

    return record ? toSummary(record) : null;
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Latest Screening summary could not be loaded");
  }
}

export async function getAccessibleScreeningSummary(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  screeningId: unknown,
  dependencies: ScreeningQueryDependencies = {},
): Promise<ScreeningSummary> {
  const parsedScreeningId = screeningIdSchema.safeParse(screeningId);

  if (!parsedScreeningId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveScreeningAccessContext(
      actor,
      relationshipId,
      SCREENING_READ_CAPABILITY,
      database,
    );
    const record = await database.screeningAssessment.findFirst({
      where: {
        id: parsedScreeningId.data,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: screeningSummarySelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    return toSummary(record);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Screening summary could not be loaded");
  }
}

export async function getAccessibleScreeningSummaries(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  screeningIds: readonly unknown[],
  dependencies: ScreeningQueryDependencies = {},
): Promise<ScreeningSummary[]> {
  if (screeningIds.length === 0) {
    return [];
  }

  if (screeningIds.length > SCREENING_SUMMARY_BATCH_LIMIT) {
    throw new ValidationError("Too many Screening summaries were requested");
  }

  const parsedScreeningIds = [...new Set(screeningIds.map((screeningId) => {
    const parsed = screeningIdSchema.safeParse(screeningId);

    if (!parsed.success) {
      throw new NotFoundError();
    }

    return parsed.data;
  }))];

  try {
    const database = getDatabase(dependencies);
    const access = await resolveScreeningAccessContext(
      actor,
      relationshipId,
      SCREENING_READ_CAPABILITY,
      database,
    );
    const records = await database.screeningAssessment.findMany({
      where: {
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        id: { in: parsedScreeningIds },
      },
      select: screeningSummarySelect,
    });
    const summariesById = new Map(records.map((record) => [record.id, toSummary(record)]));

    return parsedScreeningIds.flatMap((screeningId) => {
      const summary = summariesById.get(screeningId);
      return summary ? [summary] : [];
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Screening summaries could not be loaded");
  }
}

export async function getScreeningHistory(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: ScreeningQueryDependencies = {},
): Promise<ScreeningHistory> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveScreeningAccessContext(
      actor,
      relationshipId,
      SCREENING_READ_CAPABILITY,
      database,
    );
    const records = await database.screeningAssessment.findMany({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: SCREENING_HISTORY_LIMIT,
      select: screeningHistorySelect,
    });

    return {
      patient: access.patient,
      items: records.map(toHistoryItem),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Screening history could not be loaded");
  }
}

export async function getScreeningPatientForSubmission(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: ScreeningQueryDependencies = {},
): Promise<ScreeningPatientSummary> {
  try {
    const access = await resolveScreeningAccessContext(
      actor,
      relationshipId,
      SCREENING_SUBMIT_CAPABILITY,
      getDatabase(dependencies),
    );

    return access.patient;
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Screening patient could not be loaded");
  }
}

export async function getScreeningDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  screeningId: unknown,
  dependencies: ScreeningQueryDependencies = {},
): Promise<ScreeningDetail> {
  const parsedScreeningId = screeningIdSchema.safeParse(screeningId);

  if (!parsedScreeningId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveScreeningAccessContext(
      actor,
      relationshipId,
      SCREENING_READ_CAPABILITY,
      database,
    );
    const record = await database.screeningAssessment.findFirst({
      where: {
        id: parsedScreeningId.data,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: screeningDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    assertHistoricalDefinitions(record);
    return toDetail(record, access.patient);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Screening detail could not be loaded");
  }
}

export const screeningQueryInternals = {
  parsePersistedResponses,
  parsePersistedResult,
  toSummary,
  toDisplayName,
  toHistoryItem,
  screeningHistorySelect,
  screeningDetailSelect,
  screeningSummarySelect,
};
