// Moved unchanged from server-actions.ts: a "use server" module may export only async functions, and the
// form contract tests import these allow-lists and parsers (tests/support/form-contract.ts).
export const CREATE_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "submissionNonce",
  "scheduledAt",
  "type",
  "serviceCode",
  "responsibleUserId",
  "assignedOsmUserId",
  "durationMinutes",
  "locationType",
  "locationDetail",
  "note",
]);

export const RESCHEDULE_FORM_FIELDS = new Set([
  "rescheduleRequestId",
  "patientHospitalRelationshipId",
  "appointmentId",
  "expectedUpdatedAt",
  "scheduledAt",
  "type",
  "responsibleUserId",
  "assignedOsmUserId",
  "durationMinutes",
  "locationType",
  "locationDetail",
  "note",
]);

export const TRANSITION_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "appointmentId",
  "expectedUpdatedAt",
]);

export const ACKNOWLEDGEMENT_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "appointmentId",
  "expectedUpdatedAt",
]);

export const ASSIGNMENT_ACCEPTANCE_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "appointmentId",
  "sourceAppointmentUpdatedAt",
  "submissionNonce",
]);

export const CANCELLATION_REQUEST_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "appointmentId",
  "expectedUpdatedAt",
  "submissionNonce",
]);

export const COORDINATION_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "appointmentId",
  "submissionNonce",
]);

export const CANCELLATION_REVIEW_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "appointmentId",
  "requestId",
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

function getNullableString(formData: FormData, field: string): string | null | undefined {
  const value = getOptionalString(formData, field);

  if (value === undefined) {
    return undefined;
  }

  return value.trim() ? value.trim() : null;
}

function getNullableUuid(formData: FormData, field: string): string | null | undefined {
  return getNullableString(formData, field);
}

function getNullableInteger(formData: FormData, field: string): number | null | undefined {
  const value = getOptionalString(formData, field);

  if (value === undefined) {
    return undefined;
  }

  if (value.trim() === "") {
    return null;
  }

  return Number(value);
}

function hasUnexpectedOrDuplicateFields(formData: FormData, allowedFields: Set<string>): boolean {
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

export function buildCreateInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, CREATE_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    scheduledAt: getSingleString(formData, "scheduledAt"),
    type: getSingleString(formData, "type"),
    serviceCode: getNullableString(formData, "serviceCode"),
    responsibleUserId: getNullableUuid(formData, "responsibleUserId"),
    assignedOsmUserId: getNullableUuid(formData, "assignedOsmUserId"),
    durationMinutes: getNullableInteger(formData, "durationMinutes"),
    locationType: getNullableString(formData, "locationType"),
    locationDetail: getNullableString(formData, "locationDetail"),
    note: getNullableString(formData, "note"),
  } satisfies Record<string, unknown>;
}

export function buildRescheduleInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, RESCHEDULE_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    expectedUpdatedAt: getSingleString(formData, "expectedUpdatedAt"),
    ...(formData.has("rescheduleRequestId") ? { rescheduleRequestId: getSingleString(formData, "rescheduleRequestId") } : {}),
    scheduledAt: getSingleString(formData, "scheduledAt"),
    type: getSingleString(formData, "type"),
    responsibleUserId: getNullableUuid(formData, "responsibleUserId"),
    assignedOsmUserId: getNullableUuid(formData, "assignedOsmUserId"),
    durationMinutes: getNullableInteger(formData, "durationMinutes"),
    locationType: getNullableString(formData, "locationType"),
    locationDetail: getNullableString(formData, "locationDetail"),
    note: getNullableString(formData, "note"),
  } satisfies Record<string, unknown>;
}

export function buildTransitionInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, TRANSITION_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    expectedUpdatedAt: getSingleString(formData, "expectedUpdatedAt"),
  } satisfies Record<string, unknown>;
}

export function buildAcknowledgementInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, ACKNOWLEDGEMENT_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    expectedUpdatedAt: getSingleString(formData, "expectedUpdatedAt"),
  } satisfies Record<string, unknown>;
}

export function buildAssignmentAcceptanceInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, ASSIGNMENT_ACCEPTANCE_FORM_FIELDS)) return null;
  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    sourceAppointmentUpdatedAt: getSingleString(formData, "sourceAppointmentUpdatedAt"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
  } satisfies Record<string, unknown>;
}

export function buildCancellationRequestInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, CANCELLATION_REQUEST_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    expectedUpdatedAt: getSingleString(formData, "expectedUpdatedAt"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
  } satisfies Record<string, unknown>;
}

export function buildCoordinationInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, COORDINATION_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
  } satisfies Record<string, unknown>;
}

export function buildCancellationReviewInput(
  formData: FormData,
  decision: "APPROVE" | "REJECT",
): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, CANCELLATION_REVIEW_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    requestId: getSingleString(formData, "requestId"),
    decision,
  } satisfies Record<string, unknown>;
}
