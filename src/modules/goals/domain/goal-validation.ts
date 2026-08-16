import { ValidationError } from "@/shared/errors/application-error";

import {
  goalPlanSubmitRequestSchema,
  type GoalPlanSubmitRequest,
} from "../schemas/goal-schemas";
import { getGoalActivity } from "./goal-templates";
import type { GoalActivityDefinition, GoalTemplate } from "./goal-templates";

export type ValidatedGoalPlanItem = {
  activityCode: string;
  targetDays: number;
  targetValue: number | null;
  targetUnit: string | null;
  sortOrder: number;
};

export type ValidatedGoalPlan = {
  patientHospitalRelationshipId: string;
  submissionNonce: string;
  sourceScreeningAssessmentId: string | null;
  primaryGoalCode: string;
  primaryGoalNote: string | null;
  weeklyNote: string | null;
  items: ValidatedGoalPlanItem[];
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function isStepAligned(value: number, rule: NonNullable<GoalActivityDefinition["targetRule"]>): boolean {
  const steps = (value - rule.min) / rule.step;
  return Math.abs(steps - Math.round(steps)) < Number.EPSILON * 100;
}

function validateTarget(
  activity: GoalActivityDefinition,
  targetValue: number | null | undefined,
  targetUnit: string | null | undefined,
): { targetValue: number | null; targetUnit: string | null } {
  const normalizedValue = targetValue ?? null;
  const normalizedUnit = targetUnit?.trim() || null;

  if (!activity.targetRule) {
    if (normalizedValue !== null || normalizedUnit !== null) {
      throw new ValidationError("This activity does not accept a target value");
    }

    return { targetValue: null, targetUnit: null };
  }

  const rule = activity.targetRule;

  if (normalizedValue === null || normalizedUnit === null) {
    throw new ValidationError("This activity requires a target value and unit");
  }

  if (
    normalizedUnit !== rule.unit ||
    normalizedValue < rule.min ||
    normalizedValue > rule.max ||
    !isStepAligned(normalizedValue, rule)
  ) {
    throw new ValidationError("The activity target value is invalid");
  }

  return { targetValue: normalizedValue, targetUnit: rule.unit };
}

function validatePrimaryGoal(template: GoalTemplate, code: string): void {
  if (!template.primaryGoals.some((goal) => goal.code === code)) {
    throw new ValidationError("The primary Goal is not available in this template");
  }
}

function validateActivityCode(template: GoalTemplate, code: string): GoalActivityDefinition {
  const activity = getGoalActivity(template, code);

  if (!activity) {
    throw new ValidationError("The selected activity is not available in this template");
  }

  return activity;
}

export function validateGoalPlanInput(
  input: unknown,
  template: GoalTemplate,
): ValidatedGoalPlan {
  const parsed = goalPlanSubmitRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Goal Plan data is invalid");
  }

  const data: GoalPlanSubmitRequest = parsed.data;
  validatePrimaryGoal(template, data.primaryGoalCode);

  const activityCodes = new Set<string>();
  const items = data.items.map((item, sortOrder) => {
    const activity = validateActivityCode(template, item.activityCode);

    if (activityCodes.has(item.activityCode)) {
      throw new ValidationError("The same activity cannot be selected twice");
    }

    activityCodes.add(item.activityCode);
    const target = validateTarget(activity, item.targetValue, item.targetUnit);

    return {
      activityCode: item.activityCode,
      targetDays: item.targetDays,
      targetValue: target.targetValue,
      targetUnit: target.targetUnit,
      sortOrder,
    };
  });

  return {
    patientHospitalRelationshipId: data.patientHospitalRelationshipId,
    submissionNonce: data.submissionNonce,
    sourceScreeningAssessmentId: data.sourceScreeningAssessmentId ?? null,
    primaryGoalCode: data.primaryGoalCode,
    primaryGoalNote: normalizeOptionalText(data.primaryGoalNote),
    weeklyNote: normalizeOptionalText(data.weeklyNote),
    items,
  };
}

export const goalValidationInternals = {
  isStepAligned,
  normalizeOptionalText,
  validateActivityCode,
  validatePrimaryGoal,
  validateTarget,
};
