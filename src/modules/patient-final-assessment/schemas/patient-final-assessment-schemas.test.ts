import { describe, expect, it } from "vitest";

import { patientFinalAssessmentCreateRequestSchema } from "./patient-final-assessment-schemas";

const programId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
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

  it("does not invent a BP pairing rule beyond current Baseline/Follow-up conventions", () => {
    expect(
      patientFinalAssessmentCreateRequestSchema.safeParse(
        validInput({ weight: null, systolicBloodPressure: 120 }),
      ).success,
    ).toBe(true);
  });
});
