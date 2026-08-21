import { describe, expect, it } from "vitest";

import {
  followupCreateRequestSchema,
  followupProgramCreateRequestSchema,
} from "./followup-schemas";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "55555555-5555-4555-8555-555555555555";
const appointmentId = "22222222-2222-4222-8222-222222222222";
const goalPlanId = "33333333-3333-4333-8333-333333333333";
const nonce = "44444444-4444-4444-8444-444444444444";

function validInput(): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: nonce,
    appointmentId,
    sourceGoalPlanId: goalPlanId,
    weight: 72.5,
    waistCircumference: null,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    bloodSugar: 95,
    confidenceScore: 7,
    reflectionNote: "สะท้อนผลแบบต้นแบบ",
    confidencePlan: "จะลองทำต่อในสัปดาห์หน้า",
    generalNote: "บันทึกทั่วไป",
    activityProgress: [
      { goalActivityCode: "exercise_walk", status: "PARTIAL", note: "ทำได้บางวัน" },
    ],
  };
}

describe("Follow-up schemas", () => {
  it("accepts the strict provisional shape", () => {
    expect(followupCreateRequestSchema.safeParse(validInput()).success).toBe(true);
  });

  it("accepts Program scope without accepting a browser-supplied relationship scope", () => {
    const programInput: Record<string, unknown> = { ...validInput(), patientProgramId: programId };
    delete programInput.patientHospitalRelationshipId;

    expect(followupProgramCreateRequestSchema.safeParse(programInput).success).toBe(true);
    expect(
      followupProgramCreateRequestSchema.safeParse({
        ...programInput,
        patientHospitalRelationshipId: relationshipId,
      }).success,
    ).toBe(false);
  });

  it("rejects browser authority fields", () => {
    for (const field of [
      "actorUserId",
      "createdByUserId",
      "hospitalId",
      "patientId",
      "personId",
      "roundNumber",
      "status",
    ]) {
      expect(
        followupCreateRequestSchema.safeParse({ ...validInput(), [field]: relationshipId }).success,
      ).toBe(false);
    }
  });

  it("rejects malformed IDs and nonce", () => {
    expect(
      followupCreateRequestSchema.safeParse({ ...validInput(), patientHospitalRelationshipId: "bad" }).success,
    ).toBe(false);
    expect(
      followupCreateRequestSchema.safeParse({ ...validInput(), appointmentId: "bad" }).success,
    ).toBe(false);
    expect(
      followupCreateRequestSchema.safeParse({ ...validInput(), sourceGoalPlanId: "bad" }).success,
    ).toBe(false);
    expect(
      followupCreateRequestSchema.safeParse({ ...validInput(), submissionNonce: "bad" }).success,
    ).toBe(false);
  });

  it("rejects non-finite, negative, or structurally oversized measurements", () => {
    expect(followupCreateRequestSchema.safeParse({ ...validInput(), weight: Number.NaN }).success).toBe(false);
    expect(followupCreateRequestSchema.safeParse({ ...validInput(), weight: -1 }).success).toBe(false);
    expect(
      followupCreateRequestSchema.safeParse({ ...validInput(), bloodSugar: 1_000_001 }).success,
    ).toBe(false);
  });

  it("keeps confidence structural and provisional at 0–10", () => {
    expect(followupCreateRequestSchema.safeParse({ ...validInput(), confidenceScore: 0 }).success).toBe(true);
    expect(followupCreateRequestSchema.safeParse({ ...validInput(), confidenceScore: 10 }).success).toBe(true);
    expect(followupCreateRequestSchema.safeParse({ ...validInput(), confidenceScore: 11 }).success).toBe(false);
    expect(followupCreateRequestSchema.safeParse({ ...validInput(), confidenceScore: 4.5 }).success).toBe(false);
  });

  it("rejects unknown progress statuses and duplicate activity codes", () => {
    expect(
      followupCreateRequestSchema.safeParse({
        ...validInput(),
        activityProgress: [{ goalActivityCode: "exercise_walk", status: "GOOD" }],
      }).success,
    ).toBe(false);
    expect(
      followupCreateRequestSchema.safeParse({
        ...validInput(),
        activityProgress: [
          { goalActivityCode: "exercise_walk", status: "DONE" },
          { goalActivityCode: "exercise_walk", status: "PARTIAL" },
        ],
      }).success,
    ).toBe(false);
  });

  it("bounds notes and progress row count", () => {
    expect(
      followupCreateRequestSchema.safeParse({ ...validInput(), generalNote: "x".repeat(2_001) }).success,
    ).toBe(false);
    expect(
      followupCreateRequestSchema.safeParse({
        ...validInput(),
        activityProgress: Array.from({ length: 51 }, (_, index) => ({
          goalActivityCode: `activity_${index}`,
          status: "DONE",
        })),
      }).success,
    ).toBe(false);
  });
});
