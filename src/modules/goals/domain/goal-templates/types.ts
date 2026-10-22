export type GoalPAMLevel = "L1" | "L2" | "L3" | "L4";

export type GoalActivityCategory = "FOOD" | "EXERCISE" | "MEASUREMENT" | "REST";

export type GoalActivityTargetRule = {
  defaultValue: number;
  unit: string;
  min: number;
  max: number;
  step: number;
};

export type GoalPrimaryDefinition = {
  code: string;
  label: string;
};

export type GoalActivityDefinition = {
  code: string;
  label: string;
  category: GoalActivityCategory;
  targetRule: GoalActivityTargetRule | null;
};

export type GoalActivitySuggestion = {
  level: GoalPAMLevel;
  activityCodes: readonly string[];
  defaultTargetDays: number;
};

export type GoalTemplate = {
  key: string;
  version: string;
  label: string;
  /** R2-E: the plan carries the booklet goals, sections and signatures instead of a primary goal. */
  booklet?: boolean;
  primaryGoals: readonly GoalPrimaryDefinition[];
  activities: readonly GoalActivityDefinition[];
  activitySuggestions: readonly GoalActivitySuggestion[];
};
