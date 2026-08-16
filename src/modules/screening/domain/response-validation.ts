import { ValidationError } from "@/shared/errors/application-error";

import type { ScreeningQuestionSet } from "./question-sets/types";
import {
  screeningResponsesSchema,
  type ScreeningResponses,
} from "../schemas/screening-schemas";

function expectedQuestionKeys(questionSet: ScreeningQuestionSet, section: "PAM" | "PROMs"): string[] {
  return questionSet.questions
    .filter((question) => question.section === section && question.required)
    .map((question) => question.key);
}

function normalizeSection(
  section: Record<string, number>,
  expectedKeys: readonly string[],
  sectionLabel: string,
): Record<string, number> {
  const actualKeys = Object.keys(section);
  const expectedKeySet = new Set(expectedKeys);

  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => !expectedKeySet.has(key))
  ) {
    throw new ValidationError(`${sectionLabel} Screening answers are incomplete or invalid`);
  }

  return Object.fromEntries(expectedKeys.map((key) => [key, section[key]])) as Record<string, number>;
}

function validateAnswerRanges(
  responses: Record<string, number>,
  questionSet: ScreeningQuestionSet,
): void {
  const questions = new Map(questionSet.questions.map((question) => [question.key, question]));

  for (const [key, value] of Object.entries(responses)) {
    const question = questions.get(key);

    if (!question || value < question.minAnswer || value > question.maxAnswer) {
      throw new ValidationError("Screening answer is outside the selected question set");
    }
  }
}

export function validateScreeningResponses(
  input: unknown,
  questionSet: ScreeningQuestionSet,
): ScreeningResponses {
  const parsed = screeningResponsesSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Screening answers are invalid or incomplete");
  }

  const pam = normalizeSection(
    parsed.data.pam,
    expectedQuestionKeys(questionSet, "PAM"),
    "PAM",
  );
  const proms = normalizeSection(
    parsed.data.proms,
    expectedQuestionKeys(questionSet, "PROMs"),
    "PROMs",
  );

  validateAnswerRanges(pam, questionSet);
  validateAnswerRanges(proms, questionSet);

  return {
    pam,
    proms,
    confidenceScore: parsed.data.confidenceScore,
    confidenceImprovementPlan: parsed.data.confidenceImprovementPlan,
  };
}

export const responseValidationInternals = {
  expectedQuestionKeys,
  normalizeSection,
  validateAnswerRanges,
};
