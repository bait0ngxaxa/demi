import { describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors/application-error";

import {
  getCurrentGoalTemplate,
  getGoalTemplate,
  GOAL_TEMPLATE_KEY,
  LEGACY_GOAL_TEMPLATE_VERSION,
  type GoalTemplate,
} from "./goal-templates";
import { validateGoalPlanInput } from "./goal-validation";

/** legacy-prototype-v1 stays readable; its validation is kept for the stored plans' contract. */
function getPrototypeGoalTemplate(): GoalTemplate {
  const template = getGoalTemplate(GOAL_TEMPLATE_KEY, LEGACY_GOAL_TEMPLATE_VERSION);

  if (!template) {
    throw new Error("legacy-prototype-v1 must stay registered");
  }

  return template;
}

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

function bookletInput(overrides: Record<string, unknown> = {}, booklet: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: nonce,
    sourceScreeningAssessmentId: null,
    items: [
      { activityCode: "stop_sweet", targetDays: 4 },
      { activityCode: "cardio", targetDays: 3, targetValue: 30, targetUnit: "minutes" },
    ],
    booklet: {
      goals: { weightLossKg: 3, waistCm: null, bloodSugarMgDl: null, hba1cPercent: 7, customText: null },
      food: { notSet: false, planText: "งดน้ำหวาน", startDate: "2026-10-22" },
      exercise: { notSet: false, planText: "เดินเร็ว", startDate: null },
      problemsAfterOneMonth: null,
      patientSignatureName: "สมชาย ผู้ป่วย",
      witnessSignatureName: "  สมหญิง พยาน  ",
      ...booklet,
    },
    ...overrides,
  };
}

describe("R2-E booklet Goal Plan validation", () => {
  it("accepts a booklet plan with HbA1c in % and keeps the witness name", () => {
    expect(validateGoalPlanInput(bookletInput(), getCurrentGoalTemplate())).toMatchObject({
      primaryGoalCode: "healthy-plan",
      booklet: {
        goalWeightLossKg: 3,
        goalHba1cPercent: 7,
        foodPlanText: "งดน้ำหวาน",
        foodStartDate: new Date("2026-10-22T00:00:00.000Z"),
        foodNotSet: false,
        exerciseNotSet: false,
        patientSignatureName: "สมชาย ผู้ป่วย",
        witnessSignatureName: "สมหญิง พยาน",
      },
    });
  });

  it("refuses a plan with zero goals", () => {
    expect(() =>
      validateGoalPlanInput(
        bookletInput({}, { goals: { weightLossKg: null, waistCm: null, bloodSugarMgDl: null, hba1cPercent: null, customText: "  " } }),
        getCurrentGoalTemplate(),
      ),
    ).toThrow(ValidationError);
  });

  it.each([
    ["no text", { food: { notSet: false, planText: null, startDate: null } }, undefined],
    ["no activity item", {}, [{ activityCode: "cardio", targetDays: 3, targetValue: 30, targetUnit: "minutes" }]],
  ])("refuses a section with %s unless it is marked ไม่ได้ตั้งเป้า", (_label, booklet, items) => {
    expect(() =>
      validateGoalPlanInput(bookletInput(items ? { items } : {}, booklet), getCurrentGoalTemplate()),
    ).toThrow(ValidationError);
  });

  it("accepts a section marked ไม่ได้ตั้งเป้า only without text and items", () => {
    const exerciseOnly = [{ activityCode: "cardio", targetDays: 3, targetValue: 30, targetUnit: "minutes" }];

    expect(
      validateGoalPlanInput(
        bookletInput({ items: exerciseOnly }, { food: { notSet: true, planText: null, startDate: null } }),
        getCurrentGoalTemplate(),
      ).booklet,
    ).toMatchObject({ foodNotSet: true, foodPlanText: null });
    expect(() =>
      validateGoalPlanInput(bookletInput({}, { food: { notSet: true, planText: null, startDate: null } }), getCurrentGoalTemplate()),
    ).toThrow(ValidationError);
  });

  it("refuses HbA1c above 20 %, a legacy primary goal and activities outside the booklet sections", () => {
    expect(() =>
      validateGoalPlanInput(
        bookletInput({}, { goals: { weightLossKg: null, waistCm: null, bloodSugarMgDl: null, hba1cPercent: 48, customText: null } }),
        getCurrentGoalTemplate(),
      ),
    ).toThrow(ValidationError);
    expect(() => validateGoalPlanInput(bookletInput({ primaryGoalCode: "weight" }), getCurrentGoalTemplate())).toThrow(
      ValidationError,
    );
    expect(() =>
      validateGoalPlanInput(
        bookletInput({ items: [{ activityCode: "stop_sweet", targetDays: 4 }, { activityCode: "sleep", targetDays: 7 }] }),
        getCurrentGoalTemplate(),
      ),
    ).toThrow(ValidationError);
    expect(() => validateGoalPlanInput(bookletInput({ booklet: undefined }), getCurrentGoalTemplate())).toThrow(ValidationError);
  });
});
