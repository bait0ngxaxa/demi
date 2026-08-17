import { describe, expect, it } from "vitest";

import { patientBaselineCreateRequestSchema } from "./patient-baseline-schemas";

const relationshipId = "11111111-1111-4111-8111-111111111111";

function validInput(): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    recordedOn: "2026-08-17",
    weight: 72.5,
    waistCircumference: null,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    bloodSugarDtx: 95,
    adaptationSummary: "  สรุปการปรับตัว  ",
    adaptationObstacles: "อุปสรรค",
    adaptationOpportunities: "โอกาส",
    confidenceScore: 7,
    confidenceImprovementPlan: "แนวทาง",
    summary: "สรุป",
    recommendations: "คำแนะนำ",
  };
}

describe("Patient Baseline schemas", () => {
  it("accepts a valid partial structural snapshot and trims text", () => {
    const result = patientBaselineCreateRequestSchema.safeParse({
      ...validInput(),
      weight: null,
      bloodSugarDtx: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weight).toBeNull();
      expect(result.data.bloodSugarDtx).toBeUndefined();
      expect(result.data.adaptationSummary).toBe("สรุปการปรับตัว");
    }
  });

  it("accepts historical date-only values without timezone conversion", () => {
    expect(
      patientBaselineCreateRequestSchema.safeParse({
        ...validInput(),
        recordedOn: "1999-01-02",
      }).success,
    ).toBe(true);
    expect(
      patientBaselineCreateRequestSchema.safeParse({
        ...validInput(),
        recordedOn: "2026-02-29",
      }).success,
    ).toBe(false);
    expect(
      patientBaselineCreateRequestSchema.safeParse({
        ...validInput(),
        recordedOn: "2026-08-17T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires finite positive measurements and bounded text", () => {
    for (const field of [
      "weight",
      "waistCircumference",
      "bloodPressureSystolic",
      "bloodPressureDiastolic",
      "bloodSugarDtx",
    ]) {
      expect(
        patientBaselineCreateRequestSchema.safeParse({ ...validInput(), [field]: 0 }).success,
      ).toBe(false);
      expect(
        patientBaselineCreateRequestSchema.safeParse({ ...validInput(), [field]: -1 }).success,
      ).toBe(false);
      expect(
        patientBaselineCreateRequestSchema.safeParse({ ...validInput(), [field]: Number.NaN }).success,
      ).toBe(false);
    }

    expect(
      patientBaselineCreateRequestSchema.safeParse({
        ...validInput(),
        summary: "x".repeat(2_001),
      }).success,
    ).toBe(false);
  });

  it("accepts every optional measurement as null when it is absent", () => {
    for (const field of [
      "weight",
      "waistCircumference",
      "bloodPressureSystolic",
      "bloodPressureDiastolic",
      "bloodSugarDtx",
    ]) {
      const result = patientBaselineCreateRequestSchema.safeParse({ ...validInput(), [field]: null });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[field as keyof typeof result.data]).toBeNull();
      }
    }
  });

  it("keeps the provisional confidence scale structural at 0–10", () => {
    expect(
      patientBaselineCreateRequestSchema.safeParse({ ...validInput(), confidenceScore: 0 }).success,
    ).toBe(true);
    expect(
      patientBaselineCreateRequestSchema.safeParse({ ...validInput(), confidenceScore: 10 }).success,
    ).toBe(true);
    expect(
      patientBaselineCreateRequestSchema.safeParse({ ...validInput(), confidenceScore: 11 }).success,
    ).toBe(false);
    expect(
      patientBaselineCreateRequestSchema.safeParse({ ...validInput(), confidenceScore: 4.5 }).success,
    ).toBe(false);
  });

  it("rejects browser authority fields and unknown fields", () => {
    for (const field of [
      "recordedByUserId",
      "createdAt",
      "patientProfileId",
      "hospitalId",
      "actorUserId",
    ]) {
      expect(
        patientBaselineCreateRequestSchema.safeParse({ ...validInput(), [field]: relationshipId }).success,
      ).toBe(false);
    }
  });
});
