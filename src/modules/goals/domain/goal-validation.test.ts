import { describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors/application-error";

import { getPrototypeGoalTemplate } from "./goal-templates";
import { validateGoalPlanInput } from "./goal-validation";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const nonce = "22222222-2222-4222-8222-222222222222";

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: nonce,
    sourceScreeningAssessmentId: null,
    primaryGoalCode: "weight",
    primaryGoalNote: "  เป้าหมายต้นแบบ  ",
    weeklyNote: "  ทดลองเก็บ requirement  ",
    items: [
      { activityCode: "stop_sweet", targetDays: 4 },
      {
        activityCode: "exercise_walk",
        targetDays: 3,
        targetValue: 15,
        targetUnit: "minutes",
      },
    ],
    ...overrides,
  };
}

describe("Goal Plan validation", () => {
  it("accepts valid template values and normalizes optional notes", () => {
    expect(validateGoalPlanInput(validInput(), getPrototypeGoalTemplate())).toMatchObject({
      primaryGoalCode: "weight",
      primaryGoalNote: "เป้าหมายต้นแบบ",
      weeklyNote: "ทดลองเก็บ requirement",
      items: [
        { activityCode: "stop_sweet", targetDays: 4, targetValue: null, targetUnit: null, sortOrder: 0 },
        {
          activityCode: "exercise_walk",
          targetDays: 3,
          targetValue: 15,
          targetUnit: "minutes",
          sortOrder: 1,
        },
      ],
    });
  });

  it.each([
    ["missing primary goal", { primaryGoalCode: undefined }],
    ["empty primary goal", { primaryGoalCode: "" }],
    ["unknown primary goal", { primaryGoalCode: "unknown" }],
    ["unknown activity", { items: [{ activityCode: "unknown", targetDays: 3 }] }],
    [
      "duplicate activity",
      {
        items: [
          { activityCode: "stop_sweet", targetDays: 3 },
          { activityCode: "stop_sweet", targetDays: 4 },
        ],
      },
    ],
    ["invalid target days", { items: [{ activityCode: "stop_sweet", targetDays: 8 }] }],
    [
      "invalid target value",
      {
        items: [
          { activityCode: "exercise_walk", targetDays: 3, targetValue: 7, targetUnit: "minutes" },
        ],
      },
    ],
    [
      "invalid unit",
      {
        items: [
          { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "hours" },
        ],
      },
    ],
    [
      "unexpected fields",
      { clientRole: "ADMIN" },
    ],
  ] as const)("rejects %s", (_label, overrides) => {
    expect(() => validateGoalPlanInput(validInput(overrides), getPrototypeGoalTemplate())).toThrow(
      ValidationError,
    );
  });

  it("rejects a value supplied for an activity without a value rule", () => {
    expect(() =>
      validateGoalPlanInput(
        validInput({
          items: [{ activityCode: "stop_sweet", targetDays: 4, targetValue: 1, targetUnit: "times" }],
        }),
        getPrototypeGoalTemplate(),
      ),
    ).toThrow(ValidationError);
  });

  it("requires value and unit when the selected activity has a target rule", () => {
    expect(() =>
      validateGoalPlanInput(
        validInput({ items: [{ activityCode: "exercise_walk", targetDays: 4 }] }),
        getPrototypeGoalTemplate(),
      ),
    ).toThrow(ValidationError);
  });
});

