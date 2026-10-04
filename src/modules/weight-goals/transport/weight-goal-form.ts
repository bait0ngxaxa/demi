import { ValidationError } from "@/shared/errors/application-error";
import {
  WEIGHT_GOAL_DATE_RAW_MAX,
  WEIGHT_GOAL_FORM_MAX_BYTES,
  WEIGHT_GOAL_UUID_RAW_LENGTH,
  WEIGHT_GOAL_VERSION_RAW_MAX,
  WEIGHT_GOAL_WEIGHT_RAW_MAX,
} from "../domain/personal-weight-goal";

export type WeightGoalOperation = "read" | "create" | "update" | "remove";

const limits: Record<WeightGoalOperation, Record<string, number>> = {
  read: {},
  create: { submissionNonce: WEIGHT_GOAL_UUID_RAW_LENGTH, targetWeightKg: WEIGHT_GOAL_WEIGHT_RAW_MAX, targetDate: WEIGHT_GOAL_DATE_RAW_MAX },
  update: { goalId: WEIGHT_GOAL_UUID_RAW_LENGTH, expectedUpdatedAt: WEIGHT_GOAL_VERSION_RAW_MAX, targetWeightKg: WEIGHT_GOAL_WEIGHT_RAW_MAX, targetDate: WEIGHT_GOAL_DATE_RAW_MAX },
  remove: { goalId: WEIGHT_GOAL_UUID_RAW_LENGTH, expectedUpdatedAt: WEIGHT_GOAL_VERSION_RAW_MAX },
};

export function parseWeightGoalForm(formData: FormData, operation: WeightGoalOperation): Record<string, string> {
  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  let byteLength = 0;
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    const maxLength = limits[operation][key];
    if (maxLength === undefined || Object.hasOwn(fields, key) || typeof value !== "string" || value.length > maxLength) {
      throw new ValidationError();
    }
    byteLength += new TextEncoder().encode(key).byteLength + new TextEncoder().encode(value).byteLength;
    if (byteLength > WEIGHT_GOAL_FORM_MAX_BYTES) throw new ValidationError();
    fields[key] = value;
  }
  return fields;
}
