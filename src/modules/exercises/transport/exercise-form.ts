import { exerciseDurationTextSchema } from "../schemas/personal-exercise-schemas";
import { ValidationError } from "@/shared/errors/application-error";
import { EXERCISE_FORM_MAX_BYTES, EXERCISE_ACTIVITY_RAW_MAX, EXERCISE_DURATION_RAW_MAX, EXERCISE_NOTE_RAW_MAX, EXERCISE_CURSOR_MAX_LENGTH } from "../domain/personal-exercise";

export type ExerciseOperation = "create" | "update" | "delete" | "list";
const limits: Record<ExerciseOperation, Record<string, number>> = {
  create: { submissionNonce: 36, activityName: EXERCISE_ACTIVITY_RAW_MAX, durationMinutes: EXERCISE_DURATION_RAW_MAX, occurredOn: 10, note: EXERCISE_NOTE_RAW_MAX },
  update: { entryId: 36, expectedUpdatedAt: 40, activityName: EXERCISE_ACTIVITY_RAW_MAX, durationMinutes: EXERCISE_DURATION_RAW_MAX, occurredOn: 10, note: EXERCISE_NOTE_RAW_MAX },
  delete: { entryId: 36, expectedUpdatedAt: 40 }, list: { cursor: EXERCISE_CURSOR_MAX_LENGTH },
};
export function parseExerciseForm(formData: FormData, operation: ExerciseOperation): Record<string, string | number | null> {
  const fields: Record<string, string> = {};
  let bytes = 0;
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (!Object.hasOwn(limits[operation], key) || Object.hasOwn(fields, key) || typeof value !== "string" || value.length > limits[operation][key]) throw new ValidationError();
    bytes += new TextEncoder().encode(key).byteLength + new TextEncoder().encode(value).byteLength;
    if (bytes > EXERCISE_FORM_MAX_BYTES) throw new ValidationError();
    fields[key] = value;
  }
  if (Object.hasOwn(fields, "durationMinutes")) {
    const parsed = exerciseDurationTextSchema.safeParse(fields.durationMinutes);
    if (!parsed.success) throw new ValidationError();
    return { ...fields, durationMinutes: parsed.data };
  }
  return fields;
}
