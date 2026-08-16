import { legacyPrototypeV1QuestionSet } from "./legacy-prototype-v1";

import type { ScreeningQuestionSet } from "./types";

export type {
  ScreeningAnswerOption,
  ScreeningQuestion,
  ScreeningQuestionSection,
  ScreeningQuestionSet,
} from "./types";

export const SCREENING_QUESTION_SET_KEY = "demi-screening" as const;
export const SCREENING_QUESTION_SET_VERSION = "legacy-prototype-v1" as const;

const questionSets: readonly ScreeningQuestionSet[] = [legacyPrototypeV1QuestionSet];

export function getQuestionSet(
  key: string,
  version: string,
): ScreeningQuestionSet | null {
  return questionSets.find((questionSet) => questionSet.key === key && questionSet.version === version) ?? null;
}

export function getPrototypeQuestionSet(): ScreeningQuestionSet {
  const questionSet = getQuestionSet(SCREENING_QUESTION_SET_KEY, SCREENING_QUESTION_SET_VERSION);

  if (!questionSet) {
    throw new Error("The Screening prototype question set is unavailable");
  }

  return questionSet;
}

export const questionSetRegistry = questionSets;
