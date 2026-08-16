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
  getQuestionSet,
  SCREENING_QUESTION_SET_KEY,
} from "../domain/question-sets";
import { LEGACY_PROTOTYPE_SCORING_VERSION } from "../domain/scoring";
import {
  SCREENING_READ_CAPABILITY,
  SCREENING_SUBMIT_CAPABILITY,
} from "../policies/screening-policy";
import {
  screeningIdSchema,
  screeningResultSchema,
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

type ScreeningHistoryRecord = Prisma.ScreeningAssessmentGetPayload<{
  select: typeof screeningHistorySelect;
}>;

type ScreeningDetailRecord = Prisma.ScreeningAssessmentGetPayload<{
  select: typeof screeningDetailSelect;
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

function assertPrototypeDefinitions(detail: ScreeningDetailRecord): void {
  const questionSet = getQuestionSet(detail.questionSetKey, detail.questionSetVersion);

  if (!questionSet || detail.scoringVersion !== LEGACY_PROTOTYPE_SCORING_VERSION) {
    throw new InfrastructureError("Persisted Screening definitions are unavailable");
  }

  if (questionSet.key !== SCREENING_QUESTION_SET_KEY) {
    throw new InfrastructureError("Persisted Screening question set is unavailable");
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

    assertPrototypeDefinitions(record);
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
  toDisplayName,
  toHistoryItem,
  screeningHistorySelect,
  screeningDetailSelect,
};
