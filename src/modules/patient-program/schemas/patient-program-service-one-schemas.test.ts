import { describe, expect, it } from "vitest";

import {
  patientProgramServiceOneConfidenceRequestSchema,
  patientProgramServiceOneDreamCardRequestSchema,
  patientProgramServiceOneFloatingChartRequestSchema,
  patientProgramServiceOneRoutineRequestSchema,
} from "./patient-program-service-one-schemas";

const patientProgramId = "11111111-1111-4111-8111-111111111111";

describe("Patient Program Service 1 schemas", () => {
  it("normalizes optional reflection text and accepts a routine record", () => {
    expect(
      patientProgramServiceOneRoutineRequestSchema.safeParse({ patientProgramId }).success,
    ).toBe(true);
    expect(
      patientProgramServiceOneFloatingChartRequestSchema.parse({
        patientProgramId,
        summary: "  สรุปจากกราฟ  ",
      }),
    ).toEqual({ patientProgramId, summary: "สรุปจากกราฟ" });
    expect(
      patientProgramServiceOneDreamCardRequestSchema.parse({
        patientProgramId,
        description: "   ",
      }),
    ).toEqual({ patientProgramId, description: null });
  });

  it("rejects unknown fields and text longer than the explicit bound", () => {
    expect(
      patientProgramServiceOneRoutineRequestSchema.safeParse({
        patientProgramId,
        recordedByUserId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(false);
    expect(
      patientProgramServiceOneFloatingChartRequestSchema.safeParse({
        patientProgramId,
        summary: "x".repeat(2_001),
      }).success,
    ).toBe(false);
    expect(
      patientProgramServiceOneDreamCardRequestSchema.safeParse({
        patientProgramId,
        description: "x".repeat(2_001),
      }).success,
    ).toBe(false);
  });

  it.each([0, 10])("accepts confidence score %s", (score) => {
    expect(
      patientProgramServiceOneConfidenceRequestSchema.parse({ patientProgramId, score }),
    ).toMatchObject({ patientProgramId, score, improvementPlan: null });
  });

  it.each([-1, 11, 1.5])("rejects confidence score %s", (score) => {
    expect(
      patientProgramServiceOneConfidenceRequestSchema.safeParse({ patientProgramId, score })
        .success,
    ).toBe(false);
  });

  it("normalizes an empty confidence plan to null", () => {
    expect(
      patientProgramServiceOneConfidenceRequestSchema.parse({
        patientProgramId,
        score: 5,
        improvementPlan: "  ",
      }),
    ).toEqual({ patientProgramId, score: 5, improvementPlan: null });
  });
});
