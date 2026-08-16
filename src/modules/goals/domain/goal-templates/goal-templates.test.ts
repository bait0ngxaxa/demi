import { describe, expect, it } from "vitest";

import {
  getGoalActivity,
  getGoalSuggestion,
  getGoalTemplate,
  GOAL_TEMPLATE_KEY,
  GOAL_TEMPLATE_VERSION,
  getPrototypeGoalTemplate,
} from ".";

describe("Goals prototype template registry", () => {
  it("exposes one stable source-defined key and version", () => {
    const template = getPrototypeGoalTemplate();

    expect(template.key).toBe(GOAL_TEMPLATE_KEY);
    expect(template.version).toBe(GOAL_TEMPLATE_VERSION);
    expect(getGoalTemplate(GOAL_TEMPLATE_KEY, GOAL_TEMPLATE_VERSION)).toBe(template);
    expect(getGoalTemplate(GOAL_TEMPLATE_KEY, "unknown-version")).toBeNull();
  });

  it("contains the provisional legacy primary goals and activity definitions", () => {
    const template = getPrototypeGoalTemplate();

    expect(template.primaryGoals.map((goal) => goal.code)).toEqual([
      "weight",
      "glucose",
      "medication",
      "remission",
    ]);
    expect(template.activities.map((activity) => activity.code)).toHaveLength(13);
    expect(getGoalActivity(template, "exercise_walk")).toMatchObject({
      targetRule: { defaultValue: 15, unit: "minutes", min: 5, max: 120, step: 5 },
    });
    expect(getGoalActivity(template, "unknown-activity")).toBeNull();
  });

  it("maps prototype activity defaults to the observed PAM levels", () => {
    const template = getPrototypeGoalTemplate();

    expect(getGoalSuggestion(template, "L1")).toEqual({
      level: "L1",
      activityCodes: [],
      defaultTargetDays: 0,
    });
    expect(getGoalSuggestion(template, "L2")).toMatchObject({
      activityCodes: [
        "stop_sweet",
        "reduce_rice",
        "protein_vegetable",
        "exercise_walk",
        "record_weight_sugar",
      ],
      defaultTargetDays: 3,
    });
    expect(getGoalSuggestion(template, "L4")).toMatchObject({ defaultTargetDays: 5 });
  });
});

