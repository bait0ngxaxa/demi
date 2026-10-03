import { ValidationError } from "@/shared/errors/application-error";
import {
  MEDICATION_SCHEDULE_MAX_FIELDS, MEDICATION_ID_RAW_MAX_LENGTH, MEDICATION_VERSION_RAW_MAX_LENGTH,
  MEDICATION_SCHEDULE_JSON_MAX_LENGTH, MEDICATION_SCHEDULE_FORM_MAX_BYTES,
} from "../domain/personal-medication-definitions";

// Bound untrusted strings before JSON parsing; framework fields alone are ignored.
export function parseMedicationScheduleForm(formData: FormData): Record<string, unknown> {
  const fields: Record<string, string> = {};
  let bytes = 0;
  let count = 0;
  const limits: Record<string, number> = {
    medicationId: MEDICATION_ID_RAW_MAX_LENGTH, expectedUpdatedAt: MEDICATION_VERSION_RAW_MAX_LENGTH,
    times: MEDICATION_SCHEDULE_JSON_MAX_LENGTH,
  };
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    count += 1;
    if (count > MEDICATION_SCHEDULE_MAX_FIELDS || !Object.hasOwn(limits, key) || Object.hasOwn(fields, key) || typeof value !== "string" || value.length > limits[key]) throw new ValidationError();
    bytes += new TextEncoder().encode(key).byteLength + new TextEncoder().encode(value).byteLength;
    if (bytes > MEDICATION_SCHEDULE_FORM_MAX_BYTES) throw new ValidationError();
    fields[key] = value;
  }
  if (!Object.hasOwn(fields, "times")) throw new ValidationError();
  let times: unknown;
  try { times = JSON.parse(fields.times); } catch { throw new ValidationError(); }
  return { ...fields, times };
}
