import "server-only";

import { Prisma, type PrismaClient, type ScreeningInstrument } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  getInstrumentQuestionSet,
  getQuestionSet,
} from "../domain/question-sets";
import { parseScreeningOutcome, type ScreeningOutcome } from "../domain/screening-outcome";
import {
  SCREENING_READ_CAPABILITY,
  SCREENING_SUBMIT_CAPABILITY,
} from "../policies/screening-policy";
import {
  instrumentResponsesSchema,
  screeningIdSchema,
  type ScreeningResponses,
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
  instrument: ScreeningInstrument;
  outcome: ScreeningOutcome;
};

export type ScreeningHistory = {
  patient: ScreeningPatientSummary;
  items: ScreeningHistoryItem[];
};

export type ScreeningSummary = {
  screeningAssessmentId: string;
  submittedAt: Date;
  instrument: ScreeningInstrument;
  outcome: ScreeningOutcome;
};

/** Stored answers: the legacy combined set, or one booklet instrument (R2-C). */
export type ScreeningDetailResponses =
  | ({ kind: "LEGACY" } & ScreeningResponses)
  | { kind: "INSTRUMENT"; answers: Record<string, number> };

export type ScreeningDetail = {
  patient: ScreeningPatientSummary;
  screeningAssessmentId: string;
  submittedAt: Date;
  conductedByDisplayName: string;
  instrument: ScreeningInstrument;
  questionSetKey: string;
  questionSetVersion: string;
  scoringVersion: string;
  responses: ScreeningDetailResponses;
  outcome: ScreeningOutcome;
};

const SCREENING_HISTORY_LIMIT = 50;
const SCREENING_SUMMARY_BATCH_LIMIT = 50;

const screeningHistorySelect = {
  id: true,
  submittedAt: true,
  instrument: true,
  scoringVersion: true,
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
  responses: true,
} satisfies Prisma.ScreeningAssessmentSelect;

const screeningSummarySelect = {
  id: true,
  submittedAt: true,
  instrument: true,
  scoringVersion: true,
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

function parsePersistedOutcome(record: {
  instrument: ScreeningInstrument;
  scoringVersion: string;
  result: Prisma.JsonValue;
}): ScreeningOutcome {
  const outcome = parseScreeningOutcome(record.instrument, record.scoringVersion, record.result);

  if (!outcome) {
    throw new InfrastructureError("Persisted Screening result is invalid");
  }

  return outcome;
}

function parsePersistedResponses(
  instrument: ScreeningInstrument,
  value: Prisma.JsonValue,
): ScreeningDetailResponses {
  if (instrument === "COMBINED") {
    const parsed = screeningResponsesSchema.safeParse(value);

    if (parsed.success) {
      return { kind: "LEGACY", ...parsed.data };
    }
  } else {
    const parsed = instrumentResponsesSchema.safeParse(value);

    if (parsed.success) {
      return { kind: "INSTRUMENT", answers: parsed.data.answers };
    }
  }

  throw new InfrastructureError("Persisted Screening responses are invalid");
}

function toSummary(record: ScreeningSummaryRecord): ScreeningSummary {
  return {
    screeningAssessmentId: record.id,
    submittedAt: record.submittedAt,
    instrument: record.instrument,
    outcome: parsePersistedOutcome(record),
  };
}

function toHistoryItem(record: ScreeningHistoryRecord): ScreeningHistoryItem {
  return {
    screeningAssessmentId: record.id,
    submittedAt: record.submittedAt,
    status: "SUBMITTED",
    conductedByDisplayName: toDisplayName(record.conductedByUser.person),
    instrument: record.instrument,
    outcome: parsePersistedOutcome(record),
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
    instrument: record.instrument,
    questionSetKey: record.questionSetKey,
    questionSetVersion: record.questionSetVersion,
    scoringVersion: record.scoringVersion,
    responses: parsePersistedResponses(record.instrument, record.responses),
    outcome: parsePersistedOutcome(record),
  };
}

function assertHistoricalDefinitions(detail: ScreeningDetailRecord): void {
  const questionSet =
    detail.instrument === "COMBINED"
      ? getQuestionSet(detail.questionSetKey, detail.questionSetVersion)
      : getInstrumentQuestionSet(detail.questionSetKey, detail.questionSetVersion);

  if (!questionSet || ("instrument" in questionSet && questionSet.instrument !== detail.instrument)) {
    throw new InfrastructureError("Persisted Screening definitions are unavailable");
  }
}

/**
 * The latest readiness screening for Goal Plan context: a PAM, or a legacy combined screening. PROMs
 * never sources a Goal Plan.
 */
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
      where: {
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        instrument: { in: ["COMBINED", "PAM"] },
      },
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
  parsePersistedOutcome,
  toSummary,
  toDisplayName,
  toHistoryItem,
  screeningHistorySelect,
  screeningDetailSelect,
  screeningSummarySelect,
};
