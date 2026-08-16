import { describe, expect, it } from "vitest";

import {
  getQuestionSet,
  SCREENING_QUESTION_SET_KEY,
  SCREENING_QUESTION_SET_VERSION,
} from ".";

describe("Screening question-set registry", () => {
  it("exposes the provisional five PAM and four PROMs questions", () => {
    const questionSet = getQuestionSet(SCREENING_QUESTION_SET_KEY, SCREENING_QUESTION_SET_VERSION);

    expect(questionSet).not.toBeNull();
    expect(questionSet?.questions.filter((question) => question.section === "PAM")).toHaveLength(5);
    expect(questionSet?.questions.filter((question) => question.section === "PROMs")).toHaveLength(4);
    expect(new Set(questionSet?.questions.map((question) => question.key)).size).toBe(9);
  });

  it("keeps the prototype answer ranges explicit", () => {
    const questionSet = getQuestionSet(SCREENING_QUESTION_SET_KEY, SCREENING_QUESTION_SET_VERSION);

    expect(questionSet?.questions.filter((question) => question.section === "PAM").every((question) =>
      question.minAnswer === 1 && question.maxAnswer === 4 && question.options.length === 4,
    )).toBe(true);
    expect(questionSet?.questions.filter((question) => question.section === "PROMs").every((question) =>
      question.minAnswer === 1 && question.maxAnswer === 6 && question.options.length === 6,
    )).toBe(true);
  });

  it("fails closed for an unknown version", () => {
    expect(getQuestionSet(SCREENING_QUESTION_SET_KEY, "customer-approved-v1")).toBeNull();
  });
});
