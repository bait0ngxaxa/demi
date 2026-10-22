import { legacyPrototypeV1QuestionSet } from "./legacy-prototype-v1";
import { pamBookletV1QuestionSet } from "./pam-booklet-v1";
import { promsBookletV1QuestionSet } from "./proms-booklet-v1";

import type { InstrumentQuestionSet, ScreeningInstrumentCode, ScreeningQuestionSet } from "./types";

export type {
  InstrumentQuestion,
  InstrumentQuestionSet,
  ScreeningAnswerOption,
  ScreeningInstrumentCode,
  ScreeningQuestion,
  ScreeningQuestionSection,
  ScreeningQuestionScoreDirection,
  ScreeningQuestionSet,
} from "./types";

export { PROMS_RESULT_RULE_NOTE } from "./proms-booklet-v1";

export const SCREENING_QUESTION_SET_KEY = "demi-screening" as const;
export const SCREENING_QUESTION_SET_VERSION = "legacy-prototype-v1" as const;

/** Legacy combined PAM+PROMs sets: stored results stay readable; new submissions use an instrument set. */
const questionSets: readonly ScreeningQuestionSet[] = [legacyPrototypeV1QuestionSet];

export function getQuestionSet(
  key: string,
  version: string,
): ScreeningQuestionSet | null {
  return questionSets.find((questionSet) => questionSet.key === key && questionSet.version === version) ?? null;
}

export const questionSetRegistry = questionSets;

const instrumentQuestionSets: readonly InstrumentQuestionSet[] = [
  pamBookletV1QuestionSet,
  promsBookletV1QuestionSet,
];

/** R2-C: the version each instrument is submitted with today. */
export const CURRENT_INSTRUMENT_QUESTION_SETS: Readonly<Record<ScreeningInstrumentCode, InstrumentQuestionSet>> = {
  PAM: pamBookletV1QuestionSet,
  PROMS: promsBookletV1QuestionSet,
};

export function getInstrumentQuestionSet(key: string, version: string): InstrumentQuestionSet | null {
  return instrumentQuestionSets.find((questionSet) => questionSet.key === key && questionSet.version === version) ?? null;
}
