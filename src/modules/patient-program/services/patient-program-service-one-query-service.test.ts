import { describe, expect, it } from "vitest";

import {
  toPatientProgramServiceOneProjection,
  toPatientProgramServiceOneReportProjection,
  toPatientProgramServiceOneRounds,
  type PatientProgramServiceOneRecord,
} from "./patient-program-service-one-query-service";

const recordedAt = new Date("2026-08-20T05:00:00.000Z");
const artifactUploadedAt = new Date("2026-08-21T01:00:00.000Z");
const evidenceAssociatedAt = new Date("2026-08-21T05:00:00.000Z");

const recordedByUser = {
  person: {
    givenName: "สมชาย",
    familyName: "ผู้บันทึก",
  },
};

function record(overrides: Partial<PatientProgramServiceOneRecord> = {}): PatientProgramServiceOneRecord {
  return {
    serviceOneRoutines: [],
    serviceOneFloatingCharts: [],
    serviceOneDreamCards: [],
    serviceOneConfidences: [],
    ...overrides,
  };
}

const confidence = (roundNumber: number, score: number) => ({
  roundNumber,
  recordedAt,
  recordedByUser,
  score,
  improvementPlan: "แผนสะท้อนผล",
});

describe("Patient Program Service 1 read projection (SR-D8)", () => {
  it("returns empty structural progress before any activity is recorded", () => {
    expect(toPatientProgramServiceOneProjection(record(), 1)).toEqual({
      routine: { recorded: false, recordedAt: null, recordedBy: null, routineDate: null, entries: [], evidence: null },
      floatingChart: { recorded: false, recordedAt: null, recordedBy: null, summary: null, evidence: null },
      dreamCard: {
        recorded: false,
        recordedAt: null,
        recordedBy: null,
        description: null,
        dream: null,
        obstacle: null,
        weeklyGoal: null,
        evidence: null,
      },
      confidence: { recorded: false, recordedAt: null, recordedBy: null, score: null, improvementPlan: null },
    });
  });

  it("projects only the requested round, so a later round never overwrites round 1", () => {
    const source = record({
      serviceOneRoutines: [
        {
          roundNumber: 1,
          recordedAt,
          recordedByUser,
          routineDate: new Date("2026-08-16T00:00:00.000Z"),
          entries: [{ timeText: "06:00", activity: "ตื่นนอน", adjustment: null }],
          serviceOneArtifactAssociation: null,
        },
      ],
      serviceOneConfidences: [confidence(1, 3), confidence(2, 8)],
    });

    expect(toPatientProgramServiceOneProjection(source, 1)).toMatchObject({
      routine: {
        recorded: true,
        recordedBy: { displayName: "สมชาย ผู้บันทึก" },
        entries: [{ timeText: "06:00", activity: "ตื่นนอน", adjustment: null }],
      },
      confidence: { recorded: true, score: 3 },
    });
    expect(toPatientProgramServiceOneProjection(source, 2)).toMatchObject({
      routine: { recorded: false },
      confidence: { recorded: true, score: 8 },
    });
  });

  it("lists only the tools each round's checklist names", () => {
    const rounds = toPatientProgramServiceOneRounds(record());

    expect(rounds.map((round) => [round.roundNumber, round.listedTools])).toEqual([
      [1, ["routine", "floatingChart", "confidence"]],
      [2, ["routine", "confidence"]],
      [3, ["dreamCard", "confidence"]],
      [4, ["routine", "floatingChart", "confidence"]],
      [5, ["routine"]],
      [6, ["confidence"]],
    ]);
  });

  it("reports round 1 for the Before columns and round 3 for the dream card (R1-E)", () => {
    const projection = toPatientProgramServiceOneReportProjection(
      record({
        serviceOneConfidences: [confidence(1, 0), confidence(3, 9)],
        serviceOneDreamCards: [
          {
            roundNumber: 3,
            recordedAt,
            recordedByUser,
            description: null,
            dream: "ความฝัน",
            obstacle: null,
            weeklyGoal: "เดินวันละ 10 นาที",
            serviceOneArtifactAssociation: null,
          },
        ],
      }),
    );

    expect(projection).toMatchObject({
      confidence: { recorded: true, score: 0, improvementPlan: "แผนสะท้อนผล" },
      dreamCard: { recorded: true, dream: "ความฝัน", weeklyGoal: "เดินวันละ 10 นาที" },
    });
    expect(JSON.stringify(projection)).not.toContain("clinical");
  });

  it("projects an attached artifact without exposing its storage key", () => {
    const artifactId = "66666666-6666-4666-8666-666666666666";
    const projection = toPatientProgramServiceOneProjection(
      record({
        serviceOneRoutines: [
          {
            roundNumber: 2,
            recordedAt,
            recordedByUser,
            routineDate: null,
            entries: [],
            serviceOneArtifactAssociation: {
              createdAt: evidenceAssociatedAt,
              patientEvidenceArtifact: {
                id: artifactId,
                mediaType: "image/jpeg",
                byteSize: 1024,
                createdAt: artifactUploadedAt,
              },
            },
          },
        ],
      }),
      2,
    );

    expect(projection.routine.evidence).toEqual({
      artifactId,
      mediaType: "image/jpeg",
      byteSize: 1024,
      uploadedAt: artifactUploadedAt,
      associatedAt: evidenceAssociatedAt,
    });
    expect(JSON.stringify(projection)).not.toContain("storageObjectKey");
  });
});
