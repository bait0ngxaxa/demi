import { ValidationError } from "@/shared/errors/application-error";
import { MEAL_FORM_MAX_BYTES, MEAL_CURSOR_MAX_LENGTH } from "../domain/personal-meal";

export type MealOperation = "create" | "update" | "delete" | "list";
const limits: Record<MealOperation, Record<string, number>> = {
  create: { submissionNonce: 36, category: 9, occurredOn: 10, description: 2000 },
  update: { entryId: 36, expectedUpdatedAt: 40, category: 9, occurredOn: 10, description: 2000 },
  delete: { entryId: 36, expectedUpdatedAt: 40 }, list: { cursor: MEAL_CURSOR_MAX_LENGTH },
};
export function parseMealForm(formData: FormData, operation: MealOperation): Record<string, string> {
  const fields: Record<string, string> = {};
  let bytes = 0;
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (!Object.hasOwn(limits[operation], key) || Object.hasOwn(fields, key) || typeof value !== "string" || value.length > limits[operation][key]) throw new ValidationError();
    bytes += new TextEncoder().encode(key).byteLength + new TextEncoder().encode(value).byteLength;
    if (bytes > MEAL_FORM_MAX_BYTES) throw new ValidationError();
    fields[key] = value;
  }
  return fields;
}
