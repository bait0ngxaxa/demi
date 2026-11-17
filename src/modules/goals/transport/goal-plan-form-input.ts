// Moved unchanged from server-actions.ts: a "use server" module may export only async functions, and the
// form contract tests import these allow-lists and parsers (tests/support/form-contract.ts).
export const GOAL_PLAN_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "submissionNonce",
  "sourceScreeningAssessmentId",
  "primaryGoalCode",
  "primaryGoalNote",
  "weeklyNote",
  "items",
  "booklet",
]);

export const GOAL_PLAN_PROGRAM_FORM_FIELDS = new Set([
  "patientProgramId",
  "sourceFollowupId",
  "submissionNonce",
  "sourceScreeningAssessmentId",
  "primaryGoalCode",
  "primaryGoalNote",
  "weeklyNote",
  "items",
  "booklet",
]);

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}

function getOptionalString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length === 0) {
    return undefined;
  }

  return values.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}

function hasUnexpectedOrDuplicateFields(
  formData: FormData,
  allowedFields: ReadonlySet<string>,
): boolean {
  const seen = new Set<string>();

  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION_")) {
      continue;
    }

    if (!allowedFields.has(key) || seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function parseJsonField(formData: FormData, field: "items" | "booklet"): unknown {
  const rawValue = getSingleString(formData, field);

  if (rawValue === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return undefined;
  }
}

function buildGoalPlanPayloadInput(formData: FormData): Record<string, unknown> {
  const sourceScreeningAssessmentId = getOptionalString(
    formData,
    "sourceScreeningAssessmentId",
  );

  return {
    submissionNonce: getSingleString(formData, "submissionNonce"),
    sourceScreeningAssessmentId: sourceScreeningAssessmentId?.trim() || null,
    primaryGoalCode: getSingleString(formData, "primaryGoalCode"),
    primaryGoalNote: getOptionalString(formData, "primaryGoalNote"),
    weeklyNote: getOptionalString(formData, "weeklyNote"),
    items: parseJsonField(formData, "items"),
    booklet: parseJsonField(formData, "booklet"),
  } satisfies Record<string, unknown>;
}

export function buildSubmissionInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, GOAL_PLAN_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    ...buildGoalPlanPayloadInput(formData),
  } satisfies Record<string, unknown>;
}

export function buildProgramSubmissionInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, GOAL_PLAN_PROGRAM_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    sourceFollowupId: getOptionalString(formData, "sourceFollowupId")?.trim() || null,
    ...buildGoalPlanPayloadInput(formData),
  } satisfies Record<string, unknown>;
}
