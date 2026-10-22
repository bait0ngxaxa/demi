import { ValidationError } from "@/shared/errors/application-error";
import { serviceDateToUtcDate } from "@/shared/time/service-date";

import {
  goalPlanSubmitRequestSchema,
  type GoalPlanBookletInput,
  type GoalPlanSubmitRequest,
} from "../schemas/goal-schemas";
import { BOOKLET_PRIMARY_GOAL_CODE, getGoalActivity } from "./goal-templates";
import type { GoalActivityCategory, GoalActivityDefinition, GoalTemplate } from "./goal-templates";

export type ValidatedGoalPlanItem = {
  activityCode: string;
  targetDays: number;
  targetValue: number | null;
  targetUnit: string | null;
  sortOrder: number;
};

/** R2-E: the booklet fields of a booklet-v1 plan, as stored on PatientGoalPlan. */
export type ValidatedGoalPlanBooklet = {
  goalWeightLossKg: number | null;
  goalWaistCm: number | null;
  goalBloodSugarMgDl: number | null;
  goalHba1cPercent: number | null;
  goalCustomText: string | null;
  foodPlanText: string | null;
  foodStartDate: Date | null;
  foodNotSet: boolean;
  exercisePlanText: string | null;
  exerciseStartDate: Date | null;
  exerciseNotSet: boolean;
  problemsAfterOneMonth: string | null;
  patientSignatureName: string | null;
  witnessSignatureName: string | null;
};

export type ValidatedGoalPlan = {
  patientHospitalRelationshipId: string;
  submissionNonce: string;
  sourceScreeningAssessmentId: string | null;
  primaryGoalCode: string;
  primaryGoalNote: string | null;
  weeklyNote: string | null;
  items: ValidatedGoalPlanItem[];
  /** Null for the legacy template. */
  booklet: ValidatedGoalPlanBooklet | null;
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

const BOOKLET_SECTIONS = [
  ["food", "FOOD"],
  ["exercise", "EXERCISE"],
] as const satisfies readonly (readonly ["food" | "exercise", GoalActivityCategory])[];

/**
 * R2-E: at least one goal; each section has its text and at least one activity item of its category,
 * or is marked "ไม่ได้ตั้งเป้า" with neither text, start date nor items.
 */
function validateBooklet(
  booklet: GoalPlanBookletInput,
  items: readonly { category: GoalActivityCategory }[],
): ValidatedGoalPlanBooklet {
  const goals = booklet.goals;
  const hasGoal =
    goals.weightLossKg !== null ||
    goals.waistCm !== null ||
    goals.bloodSugarMgDl !== null ||
    goals.hba1cPercent !== null ||
    goals.customText !== null;

  if (!hasGoal) {
    throw new ValidationError("เลือกเป้าหมาย “สุขภาพดี” อย่างน้อย 1 ข้อ");
  }

  for (const [section, category] of BOOKLET_SECTIONS) {
    const value = booklet[section];
    const sectionItems = items.filter((item) => item.category === category).length;

    if (value.notSet) {
      if (value.planText !== null || value.startDate !== null || sectionItems > 0) {
        throw new ValidationError("A section marked as not set cannot have a plan");
      }
    } else if (value.planText === null || sectionItems === 0) {
      throw new ValidationError("กรอก “โดย ฉันจะ …” และเลือกกิจกรรมอย่างน้อย 1 รายการ หรือเลือก “ไม่ได้ตั้งเป้า”");
    }
  }

  return {
    goalWeightLossKg: goals.weightLossKg,
    goalWaistCm: goals.waistCm,
    goalBloodSugarMgDl: goals.bloodSugarMgDl,
    goalHba1cPercent: goals.hba1cPercent,
    goalCustomText: goals.customText,
    foodPlanText: booklet.food.planText,
    foodStartDate: booklet.food.startDate ? serviceDateToUtcDate(booklet.food.startDate) : null,
    foodNotSet: booklet.food.notSet,
    exercisePlanText: booklet.exercise.planText,
    exerciseStartDate: booklet.exercise.startDate ? serviceDateToUtcDate(booklet.exercise.startDate) : null,
    exerciseNotSet: booklet.exercise.notSet,
    problemsAfterOneMonth: booklet.problemsAfterOneMonth,
    patientSignatureName: booklet.patientSignatureName,
    witnessSignatureName: booklet.witnessSignatureName,
  };
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

  if (template.booklet) {
    // A booklet plan has no primary goal or notes of the legacy template.
    if (data.primaryGoalCode !== undefined || data.primaryGoalNote?.trim() || data.weeklyNote?.trim() || !data.booklet) {
      throw new ValidationError("Goal Plan data does not match the booklet template");
    }
  } else if (data.booklet || data.primaryGoalCode === undefined) {
    throw new ValidationError("Goal Plan data does not match the template");
  }

  const primaryGoalCode = template.booklet ? BOOKLET_PRIMARY_GOAL_CODE : (data.primaryGoalCode ?? "");
  validatePrimaryGoal(template, primaryGoalCode);

  const activityCodes = new Set<string>();
  const categories: { category: GoalActivityCategory }[] = [];
  const items = data.items.map((item, sortOrder) => {
    const activity = validateActivityCode(template, item.activityCode);
    categories.push({ category: activity.category });

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
    primaryGoalCode,
    primaryGoalNote: normalizeOptionalText(data.primaryGoalNote),
    weeklyNote: normalizeOptionalText(data.weeklyNote),
    items,
    booklet: template.booklet && data.booklet ? validateBooklet(data.booklet, categories) : null,
  };
}

export const goalValidationInternals = {
  isStepAligned,
  normalizeOptionalText,
  validateActivityCode,
  validateBooklet,
  validatePrimaryGoal,
  validateTarget,
};
