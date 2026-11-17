// @vitest-environment jsdom
// Form ↔ server contract: the exercise, meal and weight-goal editors post exactly the fields their
// parse*Form limits accept for each operation, and the parsed input passes the operation's schema.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { exerciseCreateSchema, exerciseDeleteSchema, exerciseUpdateSchema } from "@/modules/exercises/schemas/personal-exercise-schemas";
import { EXERCISE_FORM_FIELD_LIMITS, parseExerciseForm } from "@/modules/exercises/transport/exercise-form";
import { mealCreateSchema, mealDeleteSchema, mealUpdateSchema } from "@/modules/meals/schemas/personal-meal-schemas";
import { MEAL_FORM_FIELD_LIMITS, parseMealForm } from "@/modules/meals/transport/meal-form";
import {
  personalWeightGoalCreateSchema,
  personalWeightGoalRemoveSchema,
  personalWeightGoalUpdateSchema,
} from "@/modules/weight-goals/schemas/personal-weight-goal-schemas";
import { parseWeightGoalForm, WEIGHT_GOAL_FORM_FIELD_LIMITS } from "@/modules/weight-goals/transport/weight-goal-form";

import {
  captureSubmittedFormData,
  clickButton,
  clickElement,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  setFieldValue,
  settleForm,
  submitForm,
} from "../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  deleteExercise: vi.fn(),
  createMeal: vi.fn(),
  updateMeal: vi.fn(),
  deleteMeal: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  removeGoal: vi.fn(),
}));

vi.mock("@/modules/exercises/transport/server-actions", () => ({
  createPersonalExerciseAction: actions.createExercise,
  updatePersonalExerciseAction: actions.updateExercise,
  deletePersonalExerciseAction: actions.deleteExercise,
}));
vi.mock("@/modules/meals/transport/server-actions", () => ({
  createPersonalMealAction: actions.createMeal,
  updatePersonalMealAction: actions.updateMeal,
  deletePersonalMealAction: actions.deleteMeal,
}));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({
  createPersonalWeightGoalAction: actions.createGoal,
  updatePersonalWeightGoalAction: actions.updateGoal,
  removePersonalWeightGoalAction: actions.removeGoal,
}));

import { ExerciseDeleteForm, ExerciseEditor } from "./personal-exercise-controls";
import { MealDeleteForm, MealEditor } from "./personal-meal-controls";
import { PersonalWeightGoalEditor, PersonalWeightGoalRemoveConfirmation } from "./personal-weight-goal-controls";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";

const ids = {
  nonce: "11111111-1111-4111-8111-111111111111",
  entry: "22222222-2222-4222-8222-222222222222",
  goal: "33333333-3333-4333-8333-333333333333",
};
const today = "2026-11-17";
const updatedAt = "2026-11-16T03:00:00.000Z";

function coordination() {
  return {
    authority: createWellnessPrivateAuthority(() => undefined),
    blocked: false,
    isActive: () => true,
    onPending: vi.fn(),
    onResult: vi.fn(),
  };
}

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) action.mockResolvedValue({ status: "IDLE" });
});

function submitWith(container: HTMLElement, label: string | RegExp): void {
  const button = findButton(container, label);
  submitForm(button.form, button);
}

const exerciseItem = { id: ids.entry, activityName: "เดิน", occurredOn: "2026-11-16", durationMinutes: 30, note: null, createdAt: updatedAt, updatedAt };
const mealItem = { id: ids.entry, category: "LUNCH" as const, occurredOn: "2026-11-16", description: "ข้าวกล้อง", createdAt: updatedAt, updatedAt };
const goal = { id: ids.goal, targetWeightKg: "68.5", targetDate: "2026-12-31", createdAt: updatedAt, updatedAt };

describe("Exercise controls ↔ parseExerciseForm", () => {
  it("create posts the create fields", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <ExerciseEditor coordination={coordination()} maxDate={today} nonce={ids.nonce} today={today} />,
      action: actions.createExercise,
      interact: (container) => {
        clickButton(container, /วิ่ง/u);
        setFieldValue(container.querySelector('[name="durationMinutes"]'), "25");
        setFieldValue(container.querySelector('[name="note"]'), "วิ่งรอบสวน");
        submitWith(container, "บันทึกการออกกำลังกาย");
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(EXERCISE_FORM_FIELD_LIMITS.create),
      parse: (formData) => parseExerciseForm(formData, "create"),
      schema: exerciseCreateSchema,
    })).toMatchObject({ activityName: "วิ่ง", durationMinutes: 25, occurredOn: today });
  });

  it("update posts the entry version", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <ExerciseEditor coordination={coordination()} item={exerciseItem} maxDate={today} nonce={ids.nonce} today={today} />,
      action: actions.updateExercise,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="durationMinutes"]'), "40");
        submitWith(container, "บันทึกการแก้ไข");
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(EXERCISE_FORM_FIELD_LIMITS.update),
      parse: (formData) => parseExerciseForm(formData, "update"),
      schema: exerciseUpdateSchema,
    })).toMatchObject({ entryId: ids.entry, expectedUpdatedAt: updatedAt, durationMinutes: 40 });
  });

  it("delete posts the entry version only", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <ExerciseDeleteForm coordination={coordination()} item={exerciseItem} onCancel={vi.fn()} />,
      action: actions.deleteExercise,
      interact: (container) => submitWith(container, "ยืนยันลบ"),
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(EXERCISE_FORM_FIELD_LIMITS.delete),
      parse: (formData) => parseExerciseForm(formData, "delete"),
      schema: exerciseDeleteSchema,
    })).toEqual({ entryId: ids.entry, expectedUpdatedAt: updatedAt });
  });
});

describe("Meal controls ↔ parseMealForm", () => {
  it("create posts the create fields", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <MealEditor coordination={coordination()} maxDate={today} nonce={ids.nonce} today={today} />,
      action: actions.createMeal,
      interact: (container) => {
        clickElement(container.querySelector('input[name="category"][value="BREAKFAST"]'));
        setFieldValue(container.querySelector('[name="description"]'), "โจ๊กหมู");
        submitWith(container, "บันทึกมื้ออาหาร");
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(MEAL_FORM_FIELD_LIMITS.create),
      parse: (formData) => parseMealForm(formData, "create"),
      schema: mealCreateSchema,
    })).toMatchObject({ category: "BREAKFAST", description: "โจ๊กหมู", occurredOn: today });
  });

  it("update posts the entry version", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <MealEditor coordination={coordination()} item={mealItem} maxDate={today} nonce={ids.nonce} today={today} />,
      action: actions.updateMeal,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="description"]'), "ข้าวกล้องกับปลา");
        submitWith(container, "บันทึกการแก้ไข");
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(MEAL_FORM_FIELD_LIMITS.update),
      parse: (formData) => parseMealForm(formData, "update"),
      schema: mealUpdateSchema,
    })).toMatchObject({ entryId: ids.entry, category: "LUNCH", description: "ข้าวกล้องกับปลา" });
  });

  it("delete posts the entry version only", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <MealDeleteForm coordination={coordination()} item={mealItem} onCancel={vi.fn()} />,
      action: actions.deleteMeal,
      interact: (container) => submitWith(container, "ยืนยันลบ"),
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(MEAL_FORM_FIELD_LIMITS.delete),
      parse: (formData) => parseMealForm(formData, "delete"),
      schema: mealDeleteSchema,
    })).toEqual({ entryId: ids.entry, expectedUpdatedAt: updatedAt });
  });
});

describe("Weight goal controls ↔ parseWeightGoalForm", () => {
  const createContract = {
    fields: Object.keys(WEIGHT_GOAL_FORM_FIELD_LIMITS.create),
    parse: (formData: FormData) => parseWeightGoalForm(formData, "create"),
    schema: personalWeightGoalCreateSchema,
  };

  it("create posts the create fields", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <PersonalWeightGoalEditor coordination={coordination()} nonce={ids.nonce} />,
      action: actions.createGoal,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="targetWeightKg"]'), "65.5");
        setFieldValue(container.querySelector('[name="targetDate"]'), "2027-02-01");
        submitWith(container, "บันทึกเป้าหมาย");
      },
    });

    expect(expectFormContract(payload, createContract)).toMatchObject({ submissionNonce: ids.nonce, targetDate: "2027-02-01" });
  });

  it("the uncertain-create retry posts the same fields once, from the hidden copies", async () => {
    actions.createGoal.mockResolvedValueOnce({ status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้" });
    const payload = await captureSubmittedFormData({
      render: () => <PersonalWeightGoalEditor coordination={coordination()} nonce={ids.nonce} />,
      action: actions.createGoal,
      callIndex: 1,
      interact: async (container) => {
        setFieldValue(container.querySelector('[name="targetWeightKg"]'), "65.5");
        setFieldValue(container.querySelector('[name="targetDate"]'), "2027-02-01");
        submitWith(container, "บันทึกเป้าหมาย");
        await settleForm();
        submitWith(container, "ตรวจสอบผลการบันทึก");
      },
    });

    expect(actions.createGoal).toHaveBeenCalledTimes(2);
    expect(expectFormContract(payload, createContract)).toMatchObject({ submissionNonce: ids.nonce, targetDate: "2027-02-01" });
  });

  it("update posts the goal version", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <PersonalWeightGoalEditor coordination={coordination()} goal={goal} nonce={ids.nonce} />,
      action: actions.updateGoal,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="targetWeightKg"]'), "67");
        submitWith(container, "บันทึกการแก้ไข");
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(WEIGHT_GOAL_FORM_FIELD_LIMITS.update),
      parse: (formData) => parseWeightGoalForm(formData, "update"),
      schema: personalWeightGoalUpdateSchema,
    })).toMatchObject({ goalId: ids.goal, expectedUpdatedAt: updatedAt });
  });

  it("remove posts the goal version only", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <PersonalWeightGoalRemoveConfirmation coordination={coordination()} goal={goal} onCancel={vi.fn()} />,
      action: actions.removeGoal,
      interact: (container) => submitWith(container, "ยืนยันลบเป้าหมาย"),
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(WEIGHT_GOAL_FORM_FIELD_LIMITS.remove),
      parse: (formData) => parseWeightGoalForm(formData, "remove"),
      schema: personalWeightGoalRemoveSchema,
    })).toEqual({ goalId: ids.goal, expectedUpdatedAt: updatedAt });
  });
});
