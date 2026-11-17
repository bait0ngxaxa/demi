// Moved from server-actions.ts: a "use server" module may export only async functions, and the form
// contract tests import these allow-lists and parsers (tests/support/form-contract.ts). Each allow-list
// keeps the contents of the inline set it replaces.
export const PROGRAM_OPEN_FORM_FIELDS: ReadonlySet<string> = new Set(["patientHospitalRelationshipId"]);
export const PROGRAM_COMPLETE_FORM_FIELDS: ReadonlySet<string> = new Set(["patientProgramId"]);

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
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

export function buildOpenInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, PROGRAM_OPEN_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
  };
}

export function buildCompleteInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, PROGRAM_COMPLETE_FORM_FIELDS)) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
  };
}
