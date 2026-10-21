import "server-only";

import { Prisma } from "@prisma/client";

import {
  DREAM_CARD_ROUND,
  PROGRAM_ROUND_NUMBERS,
  SERVICE_ONE_HOME_ROUND,
  type ProgramRoundNumber,
} from "@/modules/patient-program-rounds/domain/round-catalog";
import { isPerRoundToolInRound } from "@/modules/patient-program-rounds/domain/round-steps";

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
      recordedByUser: recordedByUserSelect,
      serviceOneArtifactAssociation: artifactAssociationSelect,
    },
  },
  serviceOneFloatingCharts: {
    orderBy: { roundNumber: "asc" },
    select: {
      roundNumber: true,
      summary: true,
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

/** The Service 1 results of one round. */
export type PatientProgramServiceOneProjection = {
  routine: PatientProgramServiceOneActivityProjection & {
    evidence: PatientProgramServiceOneEvidenceProjection | null;
  };
  floatingChart: PatientProgramServiceOneActivityProjection & {
    summary: string | null;
    evidence: PatientProgramServiceOneEvidenceProjection | null;
  };
  dreamCard: PatientProgramServiceOneActivityProjection & {
    description: string | null;
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

export function toPatientProgramServiceOneProjection(
  record: PatientProgramServiceOneRecord | null | undefined,
  roundNumber: number,
): PatientProgramServiceOneProjection {
  const routine = inRound(record?.serviceOneRoutines, roundNumber);
  const floatingChart = inRound(record?.serviceOneFloatingCharts, roundNumber);
  const dreamCard = inRound(record?.serviceOneDreamCards, roundNumber);
  const confidence = inRound(record?.serviceOneConfidences, roundNumber);

  return {
    routine: {
      ...toActivityProjection(routine),
      evidence: toEvidenceProjection(routine),
    },
    floatingChart: {
      ...toActivityProjection(floatingChart),
      summary: floatingChart?.summary ?? null,
      evidence: toEvidenceProjection(floatingChart),
    },
    dreamCard: {
      ...toActivityProjection(dreamCard),
      description: dreamCard?.description ?? null,
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
  toPatientProgramServiceOneProjection,
  toPatientProgramServiceOneReportProjection,
  toPatientProgramServiceOneRounds,
  toRecordedBy,
};
