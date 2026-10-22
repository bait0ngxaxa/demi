import { bookletV1GoalTemplate } from "./booklet-v1";
import { legacyPrototypeV1GoalTemplate } from "./legacy-prototype-v1";
import type {
  GoalActivityDefinition,
  GoalActivitySuggestion,
  GoalPAMLevel,
  GoalTemplate,
} from "./types";

export type {
  GoalActivityCategory,
  GoalActivityDefinition,
  GoalActivitySuggestion,
  GoalActivityTargetRule,
  GoalPAMLevel,
  GoalPrimaryDefinition,
  GoalTemplate,
} from "./types";

export { BOOKLET_PLAN_TEXT, BOOKLET_PRIMARY_GOAL_CODE } from "./booklet-v1";

export const GOAL_TEMPLATE_KEY = "demi-goals" as const;
/** R2-E: new plans use the booklet template; legacy-prototype-v1 plans stay readable. */
export const GOAL_TEMPLATE_VERSION = "booklet-v1" as const;
export const LEGACY_GOAL_TEMPLATE_VERSION = "legacy-prototype-v1" as const;

const goalTemplates: readonly GoalTemplate[] = [legacyPrototypeV1GoalTemplate, bookletV1GoalTemplate];

export function getGoalTemplate(key: string, version: string): GoalTemplate | null {
  return goalTemplates.find((template) => template.key === key && template.version === version) ?? null;
}

/** The template new Goal Plans are created with. */
export function getCurrentGoalTemplate(): GoalTemplate {
  const template = getGoalTemplate(GOAL_TEMPLATE_KEY, GOAL_TEMPLATE_VERSION);

  if (!template) {
    throw new Error("The current Goals template is unavailable");
  }

  return template;
}

export function getGoalActivity(
  template: GoalTemplate,
  activityCode: string,
): GoalActivityDefinition | null {
  return template.activities.find((activity) => activity.code === activityCode) ?? null;
}

export function getGoalSuggestion(
  template: GoalTemplate,
  level: GoalPAMLevel,
): GoalActivitySuggestion | null {
  return template.activitySuggestions.find((suggestion) => suggestion.level === level) ?? null;
}

export const goalTemplateRegistry = goalTemplates;
