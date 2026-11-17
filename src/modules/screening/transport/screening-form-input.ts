// Moved from server-actions.ts: a "use server" module may export only async functions, and the form
// contract tests import this allow-list and parser (tests/support/form-contract.ts).
import {
  CURRENT_INSTRUMENT_QUESTION_SETS,
  type InstrumentQuestionSet,
} from "../domain/question-sets";
import { screeningInstrumentSchema } from "../schemas/screening-schemas";

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}

function getAnswerValue(formData: FormData, key: string): unknown {
  const value = getSingleString(formData, key);

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return Number(value);
}

function buildAnswerMap(formData: FormData, questionSet: InstrumentQuestionSet): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (const question of questionSet.questions) {
    answers[question.key] = getAnswerValue(formData, question.key);
  }

  return answers;
}

/** The fields a screening submission may post for this instrument's question set. */
export function screeningFormFields(questionSet: InstrumentQuestionSet): Set<string> {
  return new Set([
    "patientHospitalRelationshipId",
    "patientProgramId",
    "submissionNonce",
    "instrument",
    ...questionSet.questions.map((question) => question.key),
  ]);
}

function containsUnexpectedFields(formData: FormData, questionSet: InstrumentQuestionSet): boolean {
  const allowedFields = screeningFormFields(questionSet);

  for (const key of formData.keys()) {
    if (!key.startsWith("$ACTION_") && !allowedFields.has(key)) {
      return true;
    }
  }

  return false;
}

export function buildSubmissionInput(formData: FormData): unknown {
  const instrument = screeningInstrumentSchema.safeParse(getSingleString(formData, "instrument"));

  if (!instrument.success) {
    return null;
  }

  const questionSet = CURRENT_INSTRUMENT_QUESTION_SETS[instrument.data];

  if (containsUnexpectedFields(formData, questionSet)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    patientProgramId: getSingleString(formData, "patientProgramId"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    instrument: instrument.data,
    responses: { answers: buildAnswerMap(formData, questionSet) },
  } satisfies Record<string, unknown>;
}
