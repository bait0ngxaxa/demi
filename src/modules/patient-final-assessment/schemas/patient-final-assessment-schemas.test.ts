import { describe, expect, it } from "vitest";

import {
  BLOOD_PRESSURE_ORDER_MESSAGE,
  CLINICAL_VALUE_LIMITS,
  clinicalValueRangeMessage,
  type ClinicalMeasurementKind,
} from "@/shared/clinical/clinical-value-limits";

import { patientFinalAssessmentCreateRequestSchema } from "./patient-final-assessment-schemas";

const programId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    serviceDate: "2026-08-21",
    weight: 72.5,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: null,
    ...overrides,
  };
}

describe("Patient Final Assessment request schema", () => {
  it("accepts one safe provisional raw measurement", () => {
    expect(patientFinalAssessmentCreateRequestSchema.safeParse(validInput()).success).toBe(true);
  });

  it("accepts multiple safe provisional raw measurements", () => {
    expect(
      patientFinalAssessmentCreateRequestSchema.safeParse(
        validInput({
          waistCircumference: 90,
          systolicBloodPressure: 120,
          diastolicBloodPressure: 80,
          bloodSugar: 95,
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects an empty measurement payload", () => {
    expect(
      patientFinalAssessmentCreateRequestSchema.safeParse(
        validInput({
          weight: null,
          waistCircumference: null,
          systolicBloodPressure: undefined,
          diastolicBloodPressure: null,
          bloodSugar: null,
        }),
      ).success,
    ).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 1_000_001])(
    "rejects structurally invalid measurement %s",
    (value) => {
      expect(
        patientFinalAssessmentCreateRequestSchema.safeParse(validInput({ weight: value })).success,
      ).toBe(false);
    },
  );

  it("rejects unexpected client fields", () => {
    expect(
      patientFinalAssessmentCreateRequestSchema.safeParse(
        validInput({ recordedByUserId: "33333333-3333-4333-8333-333333333333" }),
      ).success,
    ).toBe(false);
  });

  it("does not require a blood pressure value to come with its pair", () => {
    expect(
      patientFinalAssessmentCreateRequestSchema.safeParse(
        validInput({ weight: null, systolicBloodPressure: 120 }),
      ).success,
    ).toBe(true);
  });
});

describe("Patient Final Assessment clinical value limits (N3)", () => {
  const fields = [
    ["weight", "weight"],
    ["waistCircumference", "waistCircumference"],
    ["systolicBloodPressure", "systolicBloodPressure"],
    ["diastolicBloodPressure", "diastolicBloodPressure"],
    ["bloodSugar", "bloodSugar"],
    ["hba1c", "hba1c"],
  ] as const satisfies readonly (readonly [string, ClinicalMeasurementKind])[];

  it.each(fields)("accepts %s inside its limits and rejects it outside, naming the field", (field, kind) => {
    const { min, max } = CLINICAL_VALUE_LIMITS[kind];

    expect(patientFinalAssessmentCreateRequestSchema.safeParse(validInput({ [field]: min })).success).toBe(true);

    const parsed = patientFinalAssessmentCreateRequestSchema.safeParse(validInput({ [field]: max + 1 }));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toContainEqual(
      expect.objectContaining({ path: [field], message: clinicalValueRangeMessage(kind) }),
    );
  });

  it("requires systolic above diastolic when both are recorded", () => {
    const parsed = patientFinalAssessmentCreateRequestSchema.safeParse(
      validInput({ systolicBloodPressure: 90, diastolicBloodPressure: 95 }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toContainEqual(
      expect.objectContaining({ path: ["systolicBloodPressure"], message: BLOOD_PRESSURE_ORDER_MESSAGE }),
    );
    expect(
      patientFinalAssessmentCreateRequestSchema.safeParse(
        validInput({ systolicBloodPressure: 120, diastolicBloodPressure: 80 }),
      ).success,
    ).toBe(true);
  });
});
