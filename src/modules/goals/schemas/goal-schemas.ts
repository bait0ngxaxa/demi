import { z } from "zod";

import { patientProgramIdSchema } from "@/modules/patient-program/schemas/patient-program-schemas";
import { serviceDateSchema } from "@/shared/time/service-date";

export const GOAL_PLAN_PRIMARY_NOTE_MAX_LENGTH = 1_000;
export const GOAL_PLAN_WEEKLY_NOTE_MAX_LENGTH = 2_000;
export const GOAL_PLAN_MAX_ITEMS = 20;
export const GOAL_PLAN_BOOKLET_TEXT_MAX_LENGTH = 1_000;
export const GOAL_PLAN_BOOKLET_PROBLEMS_MAX_LENGTH = 2_000;
export const GOAL_PLAN_SIGNATURE_NAME_MAX_LENGTH = 200;

export const goalPlanRelationshipIdSchema = z.string().uuid();
export const goalPlanIdSchema = z.string().uuid();
export const goalPlanSubmissionNonceSchema = z.string().uuid();
export const goalPlanSourceScreeningIdSchema = z.string().uuid();
export const goalPlanSourceFollowupIdSchema = z.string().uuid();

export const goalPlanItemSchema = z
  .object({
    activityCode: z.string().trim().min(1).max(64),
    targetDays: z.number().int().min(1).max(7),
    targetValue: z.number().finite().nullable().optional(),
    targetUnit: z.string().trim().min(1).max(32).nullable().optional(),
  })
  .strict();

function optionalBookletText(max: number) {
  return z
    .string()
    .max(max)
    .nullable()
    .transform((value) => value?.trim() || null);
}

/** A positive numeric target (kg, cm, mg/dL, %). */
function bookletTarget(max: number) {
  return z.number().finite().positive().max(max).nullable();
}

const goalPlanBookletSectionSchema = z
  .object({
    /** "ไม่ได้ตั้งเป้า". */
    notSet: z.boolean(),
    planText: optionalBookletText(GOAL_PLAN_BOOKLET_TEXT_MAX_LENGTH),
    startDate: serviceDateSchema.nullable(),
  })
  .strict();

/** R2-E: แผน "สุขภาพดี" ของฉัน (template booklet-v1). Cross-field rules live in goal-validation. */
export const goalPlanBookletSchema = z
  .object({
    goals: z
      .object({
        weightLossKg: bookletTarget(200),
        waistCm: bookletTarget(300),
        bloodSugarMgDl: bookletTarget(1_000),
        // Q2 (default, pending customer confirmation): HbA1c target in % (D8).
        hba1cPercent: bookletTarget(20),
        customText: optionalBookletText(GOAL_PLAN_BOOKLET_TEXT_MAX_LENGTH),
      })
      .strict(),
    food: goalPlanBookletSectionSchema,
    exercise: goalPlanBookletSectionSchema,
    problemsAfterOneMonth: optionalBookletText(GOAL_PLAN_BOOKLET_PROBLEMS_MAX_LENGTH),
    patientSignatureName: optionalBookletText(GOAL_PLAN_SIGNATURE_NAME_MAX_LENGTH),
    witnessSignatureName: optionalBookletText(GOAL_PLAN_SIGNATURE_NAME_MAX_LENGTH),
  })
  .strict();

export type GoalPlanBookletInput = z.output<typeof goalPlanBookletSchema>;

const goalPlanPayloadSchema = z
  .object({
    submissionNonce: goalPlanSubmissionNonceSchema,
    sourceScreeningAssessmentId: goalPlanSourceScreeningIdSchema.nullable().optional(),
    // Legacy template only; a booklet plan stores BOOKLET_PRIMARY_GOAL_CODE.
    primaryGoalCode: z.string().trim().min(1).max(64).optional(),
    primaryGoalNote: z
      .string()
      .max(GOAL_PLAN_PRIMARY_NOTE_MAX_LENGTH)
      .nullable()
      .optional(),
    weeklyNote: z.string().max(GOAL_PLAN_WEEKLY_NOTE_MAX_LENGTH).nullable().optional(),
    items: z.array(goalPlanItemSchema).min(1).max(GOAL_PLAN_MAX_ITEMS),
    booklet: goalPlanBookletSchema.nullable().optional(),
  })
  .strict();

export const goalPlanSubmitRequestSchema = goalPlanPayloadSchema
  .extend({ patientHospitalRelationshipId: goalPlanRelationshipIdSchema })
  .strict();

// A Program plan may record the Follow-up whose "ปรับแผน" answer produced it (Owner decision BR-06).
export const goalPlanProgramSubmitRequestSchema = goalPlanPayloadSchema
  .extend({
    patientProgramId: patientProgramIdSchema,
    sourceFollowupId: goalPlanSourceFollowupIdSchema.nullable().optional(),
  })
  .strict();

export type GoalPlanSubmitRequest = z.output<typeof goalPlanSubmitRequestSchema>;
export type GoalPlanProgramSubmitRequest = z.output<typeof goalPlanProgramSubmitRequestSchema>;
