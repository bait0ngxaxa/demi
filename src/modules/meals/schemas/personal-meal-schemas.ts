import { z } from "zod";
import { isMealCivilDate, MEAL_CATEGORIES, MEAL_CURSOR_MAX_LENGTH } from "../domain/personal-meal";

export const mealIdSchema = z.string().length(36).uuid().transform((value) => value.toLowerCase());
export const mealVersionSchema = z.string().max(40).datetime({ offset: true })
  .refine((value) => Number.isFinite(new Date(value).getTime()) && /\.(\d{3})(?:Z|[+-]\d{2}:\d{2})$/u.test(value));
export const mealDateSchema = z.string().length(10).refine(isMealCivilDate);
const fields = {
  category: z.enum(MEAL_CATEGORIES), occurredOn: mealDateSchema,
  description: z.string().max(2000).nullable().optional().transform((value) => value?.trim() || null)
    .pipe(z.string().max(1000).nullable()),
};
const version = { entryId: mealIdSchema, expectedUpdatedAt: mealVersionSchema };
export const mealCreateSchema = z.object({ submissionNonce: mealIdSchema, ...fields }).strict();
export const mealUpdateSchema = z.object({ ...version, ...fields }).strict();
export const mealDeleteSchema = z.object(version).strict();
export const mealListSchema = z.object({ cursor: z.string().min(1).max(MEAL_CURSOR_MAX_LENGTH).optional() }).strict();
export const mealCursorSchema = z.object({
  version: z.literal(1), patientProfileId: mealIdSchema, id: mealIdSchema,
  occurredOn: mealDateSchema, createdAt: mealVersionSchema, updatedAt: mealVersionSchema,
}).strict();
export type MealCursor = z.infer<typeof mealCursorSchema>;
