import { z } from "zod";

export const GOAL_PLAN_PRIMARY_NOTE_MAX_LENGTH = 1_000;
export const GOAL_PLAN_WEEKLY_NOTE_MAX_LENGTH = 2_000;
export const GOAL_PLAN_MAX_ITEMS = 20;

export const goalPlanRelationshipIdSchema = z.string().uuid();
export const goalPlanIdSchema = z.string().uuid();
export const goalPlanSubmissionNonceSchema = z.string().uuid();
export const goalPlanSourceScreeningIdSchema = z.string().uuid();

export const goalPlanItemSchema = z
  .object({
    activityCode: z.string().trim().min(1).max(64),
    targetDays: z.number().int().min(1).max(7),
    targetValue: z.number().finite().nullable().optional(),
    targetUnit: z.string().trim().min(1).max(32).nullable().optional(),
  })
  .strict();

export const goalPlanSubmitRequestSchema = z
  .object({
    patientHospitalRelationshipId: goalPlanRelationshipIdSchema,
    submissionNonce: goalPlanSubmissionNonceSchema,
    sourceScreeningAssessmentId: goalPlanSourceScreeningIdSchema.nullable().optional(),
    primaryGoalCode: z.string().trim().min(1).max(64),
    primaryGoalNote: z
      .string()
      .max(GOAL_PLAN_PRIMARY_NOTE_MAX_LENGTH)
      .nullable()
      .optional(),
    weeklyNote: z.string().max(GOAL_PLAN_WEEKLY_NOTE_MAX_LENGTH).nullable().optional(),
    items: z.array(goalPlanItemSchema).min(1).max(GOAL_PLAN_MAX_ITEMS),
  })
  .strict();

export type GoalPlanSubmitRequest = z.output<typeof goalPlanSubmitRequestSchema>;
