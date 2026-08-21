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
      serviceOneArtifactAssociation: {
        select: {
          patientEvidenceArtifact: {
            select: {
              id: true,
              mediaType: true,
              byteSize: true,
              createdAt: true,
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
      serviceOneArtifactAssociation: {
        select: {
          patientEvidenceArtifact: {
            select: {
              id: true,
              mediaType: true,
              byteSize: true,
              createdAt: true,
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
      serviceOneArtifactAssociation: {
        select: {
          patientEvidenceArtifact: {
            select: {
              id: true,
              mediaType: true,
              byteSize: true,
              createdAt: true,
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

export type PatientProgramServiceOneEvidenceProjection = {
  artifactId: string;
  mediaType: string;
  byteSize: number;
  createdAt: Date;
};

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
    patientEvidenceArtifact: {
      id: string;
      mediaType: string;
      byteSize: number;
      createdAt: Date;
    };
  } | null;
} | null): PatientProgramServiceOneEvidenceProjection | null {
  const artifact = record?.serviceOneArtifactAssociation?.patientEvidenceArtifact;

  if (!artifact) {
    return null;
  }

  return {
    artifactId: artifact.id,
    mediaType: artifact.mediaType,
    byteSize: artifact.byteSize,
    createdAt: artifact.createdAt,
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

export function toPatientProgramServiceOneProjection(
  record: PatientProgramServiceOneRecord | null | undefined,
): PatientProgramServiceOneProjection {
  const routine = record?.serviceOneRoutine ?? null;
  const floatingChart = record?.serviceOneFloatingChart ?? null;
  const dreamCard = record?.serviceOneDreamCard ?? null;
  const confidence = record?.serviceOneConfidence ?? null;

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

export const patientProgramServiceOneQueryInternals = {
  patientProgramServiceOneSelect,
  toActivityProjection,
  toDisplayName,
  toEvidenceProjection,
  toPatientProgramServiceOneProjection,
  toRecordedBy,
};
