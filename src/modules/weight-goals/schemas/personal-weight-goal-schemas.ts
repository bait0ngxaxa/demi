import { z } from "zod";
import {
  isWeightGoalCivilDate,
  normalizeTargetWeightKg,
  WEIGHT_GOAL_UUID_RAW_LENGTH,
  WEIGHT_GOAL_VERSION_RAW_MAX,
  WEIGHT_GOAL_WEIGHT_RAW_MAX,
} from "../domain/personal-weight-goal";

const uuidGrammar = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
const versionGrammar = /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}(?:Z|[+-][0-9]{2}:[0-9]{2})/u;

export const weightGoalUuidSchema = z.string().length(WEIGHT_GOAL_UUID_RAW_LENGTH)
  .refine((value) => uuidGrammar.exec(value)?.[0] === value)
  .transform((value) => value.toLowerCase());

export const weightGoalVersionSchema = z.string().max(WEIGHT_GOAL_VERSION_RAW_MAX)
  .refine((value) => {
    const match = versionGrammar.exec(value);
    return match?.[0] === value && isWeightGoalCivilDate(value.slice(0, 10)) && Number.isFinite(new Date(value).getTime());
  });

export const weightGoalTargetSchema = z.string().min(1).max(WEIGHT_GOAL_WEIGHT_RAW_MAX)
  .transform((value, context): string => {
    const normalized = normalizeTargetWeightKg(value);
    if (normalized === null) context.addIssue({ code: "custom", message: "Invalid weight target" });
    return normalized ?? value;
  });

const targetDateSchema = z.string().max(10)
  .transform((value, context): string | null => {
    if (value === "") return null;
    if (value.length !== 10 || !isWeightGoalCivilDate(value)) {
      context.addIssue({ code: "custom", message: "Invalid civil date" });
      return null;
    }
    return value;
  });

export const personalWeightGoalReadSchema = z.object({}).strict();

export const personalWeightGoalCreateSchema = z.object({
  submissionNonce: weightGoalUuidSchema,
  targetWeightKg: weightGoalTargetSchema,
  targetDate: targetDateSchema.optional().transform((value) => value ?? null),
}).strict();

export const personalWeightGoalUpdateSchema = z.object({
  goalId: weightGoalUuidSchema,
  expectedUpdatedAt: weightGoalVersionSchema,
  targetWeightKg: weightGoalTargetSchema,
  targetDate: targetDateSchema,
}).strict();

export const personalWeightGoalRemoveSchema = z.object({
  goalId: weightGoalUuidSchema,
  expectedUpdatedAt: weightGoalVersionSchema,
}).strict();

export type PersonalWeightGoalCreateInput = z.infer<typeof personalWeightGoalCreateSchema>;
export type PersonalWeightGoalUpdateInput = z.infer<typeof personalWeightGoalUpdateSchema>;
export type PersonalWeightGoalRemoveInput = z.infer<typeof personalWeightGoalRemoveSchema>;
