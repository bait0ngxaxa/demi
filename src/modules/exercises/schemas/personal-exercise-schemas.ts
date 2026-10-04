import { z } from "zod";
import { isExerciseCivilDate, EXERCISE_DURATION_RAW_MAX, EXERCISE_DURATION_MAX, EXERCISE_ACTIVITY_RAW_MAX, EXERCISE_ACTIVITY_MAX, EXERCISE_NOTE_RAW_MAX, EXERCISE_NOTE_MAX, EXERCISE_CURSOR_MAX_LENGTH } from "../domain/personal-exercise";

export const exerciseIdSchema = z.string().length(36).uuid().transform((value) => value.toLowerCase());
export const exerciseVersionSchema = z.string().max(40).datetime({ offset: true })
  .refine((value) => Number.isFinite(new Date(value).getTime()) && /\.(\d{3})(?:Z|[+-]\d{2}:\d{2})$/u.test(value));
export const exerciseDateSchema = z.string().length(10).refine(isExerciseCivilDate);
const durationValueSchema = z.number().finite().int().min(1).max(EXERCISE_DURATION_MAX).nullable();
export const exerciseDurationSchema = durationValueSchema.optional().transform((value) => value ?? null);
export const exerciseDurationTextSchema = z.string().max(EXERCISE_DURATION_RAW_MAX).transform((value) => value.trim())
  .refine((value) => value === "" || /^[0-9]{1,10}$/u.test(value))
  .transform((value) => value === "" ? null : Number(value.replace(/^0+(?=\d)/u, ""))).pipe(durationValueSchema);
const fields = {
  activityName: z.string().max(EXERCISE_ACTIVITY_RAW_MAX).refine((value) => !value.includes("\u0000"))
    .transform((value) => value.trim()).pipe(z.string().min(1).max(EXERCISE_ACTIVITY_MAX)),
  occurredOn: exerciseDateSchema,
  durationMinutes: exerciseDurationSchema,
  note: z.string().max(EXERCISE_NOTE_RAW_MAX).refine((value) => !value.includes("\u0000"))
    .nullable().optional().transform((value) => value?.trim() || null)
    .pipe(z.string().max(EXERCISE_NOTE_MAX).nullable()),
};
const version = { entryId: exerciseIdSchema, expectedUpdatedAt: exerciseVersionSchema };
export const exerciseCreateSchema = z.object({ submissionNonce: exerciseIdSchema, ...fields }).strict();
export const exerciseUpdateSchema = z.object({ ...version, ...fields }).strict();
export const exerciseDeleteSchema = z.object(version).strict();
export const exerciseListSchema = z.object({ cursor: z.string().min(1).max(EXERCISE_CURSOR_MAX_LENGTH).optional() }).strict();
export const exerciseCursorSchema = z.object({
  version: z.literal(1), patientProfileId: exerciseIdSchema, id: exerciseIdSchema,
  occurredOn: exerciseDateSchema, createdAt: exerciseVersionSchema, updatedAt: exerciseVersionSchema,
}).strict();
export type ExerciseCursor = z.infer<typeof exerciseCursorSchema>;
