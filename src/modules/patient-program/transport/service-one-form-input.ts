// Moved from patient-program-service-one-server-actions.ts: a "use server" module may export only async
// functions, and the form contract tests import these allow-lists and parsers
// (tests/support/form-contract.ts). Each allow-list keeps the contents of the inline set it replaces.
import { FLOATING_CHART_SCORE_FIELDS } from "../schemas/patient-program-service-one-schemas";

export const SERVICE_ONE_ROUTINE_FORM_FIELDS: ReadonlySet<string> = new Set(["patientProgramId", "roundNumber", "submissionNonce", "routineDate", "entries"]);
export const SERVICE_ONE_FLOATING_CHART_FORM_FIELDS: ReadonlySet<string> = new Set(["patientProgramId", "roundNumber", "submissionNonce", "summary", ...FLOATING_CHART_SCORE_FIELDS]);
export const SERVICE_ONE_DREAM_CARD_FORM_FIELDS: ReadonlySet<string> = new Set(["patientProgramId", "roundNumber", "submissionNonce", "dream", "obstacle", "weeklyGoal"]);
export const SERVICE_ONE_CONFIDENCE_FORM_FIELDS: ReadonlySet<string> = new Set(["patientProgramId", "roundNumber", "submissionNonce", "score", "improvementPlan"]);
export const SERVICE_ONE_ARTIFACT_ASSOCIATION_FORM_FIELDS: ReadonlySet<string> = new Set(["patientProgramId", "roundNumber", "activity", "patientEvidenceArtifactId"]);

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}
function getSingleInteger(formData: FormData, field: string): number | undefined {
  const value = getSingleString(formData, field);

  if (value === undefined || !/^-?\d+$/u.test(value.trim())) {
    return undefined;
  }

  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function hasUnexpectedOrDuplicateFields(formData: FormData, allowedFields: ReadonlySet<string>): boolean {
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

function parseJsonField(formData: FormData, field: string): unknown {
  const raw = getSingleString(formData, field);

  if (raw === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function buildRoutineInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, SERVICE_ONE_ROUTINE_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getSingleInteger(formData, "roundNumber"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    routineDate: getSingleString(formData, "routineDate"),
    entries: parseJsonField(formData, "entries"),
  };
}

export function buildFloatingChartInput(formData: FormData): unknown {
  if (
    hasUnexpectedOrDuplicateFields(
      formData,
      SERVICE_ONE_FLOATING_CHART_FORM_FIELDS,
    )
  ) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getSingleInteger(formData, "roundNumber"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    summary: getSingleString(formData, "summary"),
    ...Object.fromEntries(FLOATING_CHART_SCORE_FIELDS.map((field) => [field, getSingleInteger(formData, field)])),
  };
}

export function buildDreamCardInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, SERVICE_ONE_DREAM_CARD_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getSingleInteger(formData, "roundNumber"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    dream: getSingleString(formData, "dream"),
    obstacle: getSingleString(formData, "obstacle"),
    weeklyGoal: getSingleString(formData, "weeklyGoal"),
  };
}

export function buildConfidenceInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, SERVICE_ONE_CONFIDENCE_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getSingleInteger(formData, "roundNumber"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    score: getSingleInteger(formData, "score"),
    improvementPlan: getSingleString(formData, "improvementPlan"),
  };
}

export function buildArtifactAssociationInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, SERVICE_ONE_ARTIFACT_ASSOCIATION_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    roundNumber: getSingleInteger(formData, "roundNumber"),
    activity: getSingleString(formData, "activity"),
    patientEvidenceArtifactId: getSingleString(formData, "patientEvidenceArtifactId"),
  };
}
