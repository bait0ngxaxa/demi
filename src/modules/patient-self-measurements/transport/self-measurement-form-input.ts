// Moved from server-actions.ts: a "use server" module may export only async functions, and the form
// contract tests run these field reads (tests/support/form-contract.ts). The reads are unchanged.
function formNumber(formData: FormData, key: string): number | null | string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** `measuredAt` arrives as a Thailand local `datetime-local` value. */
function bangkokDateTime(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value) ? `${value}:00+07:00` : value;
}

/** The create input the action passes to the service, read from the posted form. */
export function buildSelfMeasurementCreateInput(formData: FormData): Record<string, unknown> {
  const bloodSugarUnit = formString(formData, "bloodSugarUnit");
  return {
    submissionNonce: formString(formData, "submissionNonce"),
    measuredAt: bangkokDateTime(formString(formData, "measuredAt")),
    weight: formNumber(formData, "weight"),
    systolicBloodPressure: formNumber(formData, "systolicBloodPressure"),
    diastolicBloodPressure: formNumber(formData, "diastolicBloodPressure"),
    bloodSugar: formNumber(formData, "bloodSugar"),
    ...(bloodSugarUnit ? { bloodSugarUnit } : {}),
    note: formString(formData, "note"),
  };
}

/** The measurement the delete action removes. */
export function readSelfMeasurementId(formData: FormData): string {
  return formString(formData, "measurementId");
}
