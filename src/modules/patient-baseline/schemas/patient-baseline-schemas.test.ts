import { describe, expect, it } from "vitest";

import {
  BLOOD_PRESSURE_ORDER_MESSAGE,
  CLINICAL_VALUE_LIMITS,
  clinicalValueRangeMessage,
  type ClinicalMeasurementKind,
} from "@/shared/clinical/clinical-value-limits";

import { patientBaselineCreateRequestSchema } from "./patient-baseline-schemas";

const relationshipId = "11111111-1111-4111-8111-111111111111";

function validInput(): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    recordedOn: "2026-08-17",
    weight: 72.5,
    heightCm: 170,
    waistCircumference: null,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    bloodSugarDtx: 95,
    hba1c: 6.5,
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
      "heightCm",
      "waistCircumference",
      "bloodPressureSystolic",
      "bloodPressureDiastolic",
      "bloodSugarDtx",
      "hba1c",
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
      "heightCm",
      "waistCircumference",
      "bloodPressureSystolic",
      "bloodPressureDiastolic",
      "bloodSugarDtx",
      "hba1c",
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

describe("Patient Baseline clinical value limits (N3)", () => {
  const fields = [
    ["weight", "weight"],
    ["heightCm", "height"],
    ["waistCircumference", "waistCircumference"],
    ["bloodPressureSystolic", "systolicBloodPressure"],
    ["bloodPressureDiastolic", "diastolicBloodPressure"],
    ["bloodSugarDtx", "bloodSugar"],
    ["hba1c", "hba1c"],
  ] as const satisfies readonly (readonly [string, ClinicalMeasurementKind])[];

  it.each(fields)("accepts %s inside its limits and rejects it outside, naming the field", (field, kind) => {
    const { min, max } = CLINICAL_VALUE_LIMITS[kind];
    const inRange = field === "bloodPressureSystolic" ? max : min;

    expect(patientBaselineCreateRequestSchema.safeParse({ ...validInput(), [field]: inRange }).success).toBe(true);

    const parsed = patientBaselineCreateRequestSchema.safeParse({ ...validInput(), [field]: max + 1 });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toContainEqual(
      expect.objectContaining({ path: [field], message: clinicalValueRangeMessage(kind) }),
    );
  });

  it("requires systolic above diastolic when both are recorded", () => {
    const parsed = patientBaselineCreateRequestSchema.safeParse({
      ...validInput(),
      bloodPressureSystolic: 80,
      bloodPressureDiastolic: 80,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toContainEqual(
      expect.objectContaining({ path: ["bloodPressureSystolic"], message: BLOOD_PRESSURE_ORDER_MESSAGE }),
    );
    expect(
      patientBaselineCreateRequestSchema.safeParse({ ...validInput(), bloodPressureDiastolic: null }).success,
    ).toBe(true);
  });
});
