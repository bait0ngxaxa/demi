import { describe, expect, it } from "vitest";

import {
  getCurrentGoalTemplate,
  getGoalActivity,
  getGoalSuggestion,
  getGoalTemplate,
  GOAL_TEMPLATE_KEY,
  GOAL_TEMPLATE_VERSION,
  LEGACY_GOAL_TEMPLATE_VERSION,
  type GoalTemplate,
} from ".";

function getPrototypeGoalTemplate(): GoalTemplate {
  const template = getGoalTemplate(GOAL_TEMPLATE_KEY, LEGACY_GOAL_TEMPLATE_VERSION);

  if (!template) {
    throw new Error("legacy-prototype-v1 must stay registered");
  }

  return template;
}

describe("Goals template registry", () => {
  it("creates new plans with booklet-v1 and keeps legacy-prototype-v1 readable (R2-E)", () => {
    const template = getCurrentGoalTemplate();

    expect(template.key).toBe(GOAL_TEMPLATE_KEY);
    expect(template.version).toBe(GOAL_TEMPLATE_VERSION);
    expect(GOAL_TEMPLATE_VERSION).toBe("booklet-v1");
    expect(template.booklet).toBe(true);
    expect(template.label).toBe("แผน “สุขภาพดี” ของฉัน");
    expect(getGoalTemplate(GOAL_TEMPLATE_KEY, GOAL_TEMPLATE_VERSION)).toBe(template);
    expect(getPrototypeGoalTemplate().version).toBe("legacy-prototype-v1");
    expect(getGoalTemplate(GOAL_TEMPLATE_KEY, "unknown-version")).toBeNull();
  });

  it("keeps the legacy food and exercise activity codes in the booklet sections", () => {
    const template = getCurrentGoalTemplate();
    const legacy = getPrototypeGoalTemplate();

    expect(template.activities.every((activity) => activity.category === "FOOD" || activity.category === "EXERCISE")).toBe(true);
    expect(template.activities).toEqual(
      legacy.activities.filter((activity) => activity.category === "FOOD" || activity.category === "EXERCISE"),
    );
    expect(template.activitySuggestions).toEqual([]);
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

