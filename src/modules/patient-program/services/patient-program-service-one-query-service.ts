import "server-only";

import { Prisma } from "@prisma/client";

import {
  DREAM_CARD_ROUND,
  PROGRAM_ROUND_NUMBERS,
  SERVICE_ONE_HOME_ROUND,
  type ProgramRoundNumber,
} from "@/modules/patient-program-rounds/domain/round-catalog";
import { isPerRoundToolInRound } from "@/modules/patient-program-rounds/domain/round-steps";
import type { PatientProgramServiceOneFloatingChartScores } from "../schemas/patient-program-service-one-schemas";

const recordedByUserSelect = {
  select: {
    person: {
      select: {
        givenName: true,
        familyName: true,
      },
    },
  },
} as const;

const artifactAssociationSelect = {
  select: {
    createdAt: true,
    patientEvidenceArtifact: {
      select: {
        id: true,
        mediaType: true,
        byteSize: true,
        createdAt: true,
      },
    },
  },
} as const;

/** SR-D8: one result per round; every round's results are loaded in round order. */
export const patientProgramServiceOneSelect = {
  serviceOneRoutines: {
    orderBy: { roundNumber: "asc" },
    select: {
      roundNumber: true,
      recordedAt: true,
      routineDate: true,
      entries: {
        orderBy: { sortOrder: "asc" },
        select: { timeText: true, activity: true, adjustment: true },
      },
      recordedByUser: recordedByUserSelect,
      serviceOneArtifactAssociation: artifactAssociationSelect,
    },
  },
  serviceOneFloatingCharts: {
    orderBy: { roundNumber: "asc" },
    select: {
      roundNumber: true,
      summary: true,
      familyScore: true,
      eatingScore: true,
      workScore: true,
      healthScore: true,
      financeScore: true,
      travelScore: true,
      exerciseScore: true,
      wellbeingScore: true,
      recordedAt: true,
      recordedByUser: recordedByUserSelect,
      serviceOneArtifactAssociation: artifactAssociationSelect,
    },
  },
  serviceOneDreamCards: {
    orderBy: { roundNumber: "asc" },
    select: {
      roundNumber: true,
      description: true,
      dream: true,
      obstacle: true,
      weeklyGoal: true,
      recordedAt: true,
      recordedByUser: recordedByUserSelect,
      serviceOneArtifactAssociation: artifactAssociationSelect,
    },
  },
  serviceOneConfidences: {
    orderBy: { roundNumber: "asc" },
    select: {
      roundNumber: true,
      score: true,
      improvementPlan: true,
      recordedAt: true,
      recordedByUser: recordedByUserSelect,
    },
  },
} satisfies Prisma.PatientProgramSelect;

export type PatientProgramServiceOneRecord = Prisma.PatientProgramGetPayload<{
  select: typeof patientProgramServiceOneSelect;
}>;

export type PatientProgramServiceOneActivityProjection = {
  recorded: boolean;
  recordedAt: Date | null;
  recordedBy: {
    displayName: string;
  } | null;
};

export type PatientProgramServiceOneEvidenceProjection = {
  artifactId: string;
  mediaType: string;
  byteSize: number;
  uploadedAt: Date;
  associatedAt: Date;
};

/** R2-G: one row of ตารางชีวิตของฉัน. */
export type PatientProgramServiceOneRoutineEntryProjection = {
  timeText: string | null;
  activity: string;
  adjustment: string | null;
};

/** The Service 1 results of one round. */
export type PatientProgramServiceOneProjection = {
  routine: PatientProgramServiceOneActivityProjection & {
    /** Null for routines recorded before R2. */
    routineDate: Date | null;
    entries: readonly PatientProgramServiceOneRoutineEntryProjection[];
    evidence: PatientProgramServiceOneEvidenceProjection | null;
  };
  floatingChart: PatientProgramServiceOneActivityProjection & {
    summary: string | null;
    scores: PatientProgramServiceOneFloatingChartScores | null;
    /** Round 1 scores, included only for the round 4 comparison. */
    roundOneScores: PatientProgramServiceOneFloatingChartScores | null;
    evidence: PatientProgramServiceOneEvidenceProjection | null;
  };
  dreamCard: PatientProgramServiceOneActivityProjection & {
    /** Legacy (before R2) free text. */
    description: string | null;
    dream: string | null;
    obstacle: string | null;
    weeklyGoal: string | null;
    evidence: PatientProgramServiceOneEvidenceProjection | null;
  };
  confidence: PatientProgramServiceOneActivityProjection & {
    score: number | null;
    improvementPlan: string | null;
  };
};

export type PatientProgramServiceOneRoundProjection = PatientProgramServiceOneProjection & {
  roundNumber: ProgramRoundNumber;
  /** Tools this round's checklist lists (SR-D8). */
  listedTools: readonly ("routine" | "floatingChart" | "dreamCard" | "confidence")[];
};

export function withoutPatientProgramServiceOneRecorders<
  T extends PatientProgramServiceOneProjection,
>(projection: T): T {
  return {
    ...projection,
    routine: { ...projection.routine, recordedBy: null },
    floatingChart: { ...projection.floatingChart, recordedBy: null },
    dreamCard: { ...projection.dreamCard, recordedBy: null },
    confidence: { ...projection.confidence, recordedBy: null },
  };
}

function toDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ไม่ระบุผู้บันทึก";
}

function toRecordedBy(record: {
  recordedByUser: {
    person: {
      givenName: string | null;
      familyName: string | null;
    };
  };
} | null): { displayName: string } | null {
  return record ? { displayName: toDisplayName(record.recordedByUser.person) } : null;
}

function toEvidenceProjection(record: {
  serviceOneArtifactAssociation: {
    createdAt: Date;
    patientEvidenceArtifact: {
      id: string;
      mediaType: string;
      byteSize: number;
      createdAt: Date;
    };
  } | null;
} | null): PatientProgramServiceOneEvidenceProjection | null {
  const association = record?.serviceOneArtifactAssociation;
  const artifact = association?.patientEvidenceArtifact;

  if (!association || !artifact) {
    return null;
  }

  return {
    artifactId: artifact.id,
    mediaType: artifact.mediaType,
    byteSize: artifact.byteSize,
    uploadedAt: artifact.createdAt,
    associatedAt: association.createdAt,
  };
}

function toActivityProjection(record: {
  recordedAt: Date;
  recordedByUser: {
    person: {
      givenName: string | null;
      familyName: string | null;
    };
  };
} | null): PatientProgramServiceOneActivityProjection {
  return {
    recorded: record !== null,
    recordedAt: record?.recordedAt ?? null,
    recordedBy: toRecordedBy(record),
  };
}

function inRound<T extends { roundNumber: number }>(records: readonly T[] | undefined, roundNumber: number): T | null {
  return records?.find((record) => record.roundNumber === roundNumber) ?? null;
}

function toFloatingChartScores(
  record: PatientProgramServiceOneRecord["serviceOneFloatingCharts"][number] | null,
): PatientProgramServiceOneFloatingChartScores | null {
  if (
    !record ||
    record.familyScore === null ||
    record.eatingScore === null ||
    record.workScore === null ||
    record.healthScore === null ||
    record.financeScore === null ||
    record.travelScore === null ||
    record.exerciseScore === null ||
    record.wellbeingScore === null
  ) {
    return null;
  }

  return {
    familyScore: record.familyScore,
    eatingScore: record.eatingScore,
    workScore: record.workScore,
    healthScore: record.healthScore,
    financeScore: record.financeScore,
    travelScore: record.travelScore,
    exerciseScore: record.exerciseScore,
    wellbeingScore: record.wellbeingScore,
  };
}

export function toPatientProgramServiceOneProjection(
  record: PatientProgramServiceOneRecord | null | undefined,
  roundNumber: number,
): PatientProgramServiceOneProjection {
  const routine = inRound(record?.serviceOneRoutines, roundNumber);
  const floatingChart = inRound(record?.serviceOneFloatingCharts, roundNumber);
  const roundOneFloatingChart = inRound(record?.serviceOneFloatingCharts, 1);
  const dreamCard = inRound(record?.serviceOneDreamCards, roundNumber);
  const confidence = inRound(record?.serviceOneConfidences, roundNumber);

  return {
    routine: {
      ...toActivityProjection(routine),
      routineDate: routine?.routineDate ?? null,
      entries: routine?.entries ?? [],
      evidence: toEvidenceProjection(routine),
    },
    floatingChart: {
      ...toActivityProjection(floatingChart),
      summary: floatingChart?.summary ?? null,
      scores: toFloatingChartScores(floatingChart),
      roundOneScores: roundNumber === 4 ? toFloatingChartScores(roundOneFloatingChart) : null,
      evidence: toEvidenceProjection(floatingChart),
    },
    dreamCard: {
      ...toActivityProjection(dreamCard),
      description: dreamCard?.description ?? null,
      dream: dreamCard?.dream ?? null,
      obstacle: dreamCard?.obstacle ?? null,
      weeklyGoal: dreamCard?.weeklyGoal ?? null,
      evidence: toEvidenceProjection(dreamCard),
    },
    confidence: {
      ...toActivityProjection(confidence),
      score: confidence?.score ?? null,
      improvementPlan: confidence?.improvementPlan ?? null,
    },
  };
}

/** Rounds that list at least one Service 1 tool, each with its own results. */
export function toPatientProgramServiceOneRounds(
  record: PatientProgramServiceOneRecord | null | undefined,
): PatientProgramServiceOneRoundProjection[] {
  return PROGRAM_ROUND_NUMBERS.map((roundNumber) => ({
    roundNumber,
    listedTools: (
      [
        ["routine", "ROUTINE"],
        ["floatingChart", "FLOATING_CHART"],
        ["dreamCard", "DREAM_CARD"],
        ["confidence", "CONFIDENCE_RULER"],
      ] as const
    )
      .filter(([, code]) => isPerRoundToolInRound(roundNumber, code))
      .map(([key]) => key),
    ...toPatientProgramServiceOneProjection(record, roundNumber),
  })).filter((round) => round.listedTools.length > 0);
}

/**
 * R1-E: the report's Service 1 "Before" view: routine, floating chart and ruler from round 1, the dream
 * card from round 3 (SR-D11). A skipped tool has no record and so reports as not done.
 */
export function toPatientProgramServiceOneReportProjection(
  record: PatientProgramServiceOneRecord | null | undefined,
): PatientProgramServiceOneProjection {
  return {
    ...toPatientProgramServiceOneProjection(record, SERVICE_ONE_HOME_ROUND),
    dreamCard: toPatientProgramServiceOneProjection(record, DREAM_CARD_ROUND).dreamCard,
  };
}

export const patientProgramServiceOneQueryInternals = {
  patientProgramServiceOneSelect,
  toActivityProjection,
  toDisplayName,
  toEvidenceProjection,
  toFloatingChartScores,
  toPatientProgramServiceOneProjection,
  toPatientProgramServiceOneReportProjection,
  toPatientProgramServiceOneRounds,
  toRecordedBy,
  withoutPatientProgramServiceOneRecorders,
};
