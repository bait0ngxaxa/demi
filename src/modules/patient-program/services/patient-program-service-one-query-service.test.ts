import { describe, expect, it } from "vitest";

import { toPatientProgramServiceOneProjection } from "./patient-program-service-one-query-service";

const recordedAt = new Date("2026-08-20T05:00:00.000Z");

const recordedByUser = {
  person: {
    givenName: "สมชาย",
    familyName: "ผู้บันทึก",
  },
};

describe("Patient Program Service 1 read projection", () => {
  it("returns empty structural progress before any activity is recorded", () => {
    const projection = toPatientProgramServiceOneProjection({
      serviceOneRoutine: null,
      serviceOneFloatingChart: null,
      serviceOneDreamCard: null,
      serviceOneConfidence: null,
    });

    expect(projection).toEqual({
      routine: { recorded: false, recordedAt: null, recordedBy: null, evidence: null },
      floatingChart: {
        recorded: false,
        recordedAt: null,
        recordedBy: null,
        summary: null,
        evidence: null,
      },
      dreamCard: {
        recorded: false,
        recordedAt: null,
        recordedBy: null,
        description: null,
        evidence: null,
      },
      confidence: {
        recorded: false,
        recordedAt: null,
        recordedBy: null,
        score: null,
        improvementPlan: null,
      },
    });
  });

  it("projects partial activity progress and safe display identity", () => {
    const projection = toPatientProgramServiceOneProjection({
      serviceOneRoutine: { recordedAt, recordedByUser, serviceOneArtifactAssociation: null },
      serviceOneFloatingChart: {
        recordedAt,
        recordedByUser,
        summary: "สรุปจากกราฟ",
        serviceOneArtifactAssociation: null,
      },
      serviceOneDreamCard: null,
      serviceOneConfidence: null,
    });

    expect(projection.routine).toMatchObject({
      recorded: true,
      recordedAt,
      recordedBy: { displayName: "สมชาย ผู้บันทึก" },
    });
    expect(projection.floatingChart).toMatchObject({
      recorded: true,
      summary: "สรุปจากกราฟ",
    });
    expect(projection.dreamCard.recorded).toBe(false);
    expect(projection.confidence.score).toBeNull();
  });

  it("keeps confidence structural and does not infer clinical meaning", () => {
    const projection = toPatientProgramServiceOneProjection({
      serviceOneRoutine: { recordedAt, recordedByUser, serviceOneArtifactAssociation: null },
      serviceOneFloatingChart: {
        recordedAt,
        recordedByUser,
        summary: null,
        serviceOneArtifactAssociation: null,
      },
      serviceOneDreamCard: {
        recordedAt,
        recordedByUser,
        description: "ความฝัน",
        serviceOneArtifactAssociation: null,
      },
      serviceOneConfidence: {
        recordedAt,
        recordedByUser,
        score: 0,
        improvementPlan: "แผนสะท้อนผล",
      },
    });

    expect(projection).toMatchObject({
      confidence: {
        recorded: true,
        score: 0,
        improvementPlan: "แผนสะท้อนผล",
      },
      dreamCard: { description: "ความฝัน" },
    });
    expect(JSON.stringify(projection)).not.toContain("clinical");
  });

  it("projects an attached artifact without exposing its storage key", () => {
    const artifactId = "66666666-6666-4666-8666-666666666666";
    const projection = toPatientProgramServiceOneProjection({
      serviceOneRoutine: {
        recordedAt,
        recordedByUser,
        serviceOneArtifactAssociation: {
          patientEvidenceArtifact: {
            id: artifactId,
            mediaType: "image/jpeg",
            byteSize: 1024,
            createdAt: recordedAt,
          },
        },
      },
      serviceOneFloatingChart: null,
      serviceOneDreamCard: null,
      serviceOneConfidence: null,
    });

    expect(projection.routine.evidence).toEqual({
      artifactId,
      mediaType: "image/jpeg",
      byteSize: 1024,
      createdAt: recordedAt,
    });
    expect(JSON.stringify(projection)).not.toContain("storageObjectKey");
  });
});
