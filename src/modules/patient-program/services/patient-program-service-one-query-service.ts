import "server-only";

import { Prisma } from "@prisma/client";

export const patientProgramServiceOneSelect = {
  serviceOneRoutine: {
    select: {
      recordedAt: true,
      recordedByUser: {
        select: {
          person: {
            select: {
              givenName: true,
              familyName: true,
            },
          },
        },
      },
    },
  },
  serviceOneFloatingChart: {
    select: {
      summary: true,
      recordedAt: true,
      recordedByUser: {
        select: {
          person: {
            select: {
              givenName: true,
              familyName: true,
            },
          },
        },
      },
    },
  },
  serviceOneDreamCard: {
    select: {
      description: true,
      recordedAt: true,
      recordedByUser: {
        select: {
          person: {
            select: {
              givenName: true,
              familyName: true,
            },
          },
        },
      },
    },
  },
  serviceOneConfidence: {
    select: {
      score: true,
      improvementPlan: true,
      recordedAt: true,
      recordedByUser: {
        select: {
          person: {
            select: {
              givenName: true,
              familyName: true,
            },
          },
        },
      },
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

export type PatientProgramServiceOneProjection = {
  routine: PatientProgramServiceOneActivityProjection;
  floatingChart: PatientProgramServiceOneActivityProjection & {
    summary: string | null;
  };
  dreamCard: PatientProgramServiceOneActivityProjection & {
    description: string | null;
  };
  confidence: PatientProgramServiceOneActivityProjection & {
    score: number | null;
    improvementPlan: string | null;
  };
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

export function toPatientProgramServiceOneProjection(
  record: PatientProgramServiceOneRecord | null | undefined,
): PatientProgramServiceOneProjection {
  const routine = record?.serviceOneRoutine ?? null;
  const floatingChart = record?.serviceOneFloatingChart ?? null;
  const dreamCard = record?.serviceOneDreamCard ?? null;
  const confidence = record?.serviceOneConfidence ?? null;

  return {
    routine: toActivityProjection(routine),
    floatingChart: {
      ...toActivityProjection(floatingChart),
      summary: floatingChart?.summary ?? null,
    },
    dreamCard: {
      ...toActivityProjection(dreamCard),
      description: dreamCard?.description ?? null,
    },
    confidence: {
      ...toActivityProjection(confidence),
      score: confidence?.score ?? null,
      improvementPlan: confidence?.improvementPlan ?? null,
    },
  };
}

export const patientProgramServiceOneQueryInternals = {
  patientProgramServiceOneSelect,
  toActivityProjection,
  toDisplayName,
  toPatientProgramServiceOneProjection,
  toRecordedBy,
};
