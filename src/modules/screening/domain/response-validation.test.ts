import { describe, expect, it } from "vitest";

import { CURRENT_INSTRUMENT_QUESTION_SETS } from "./question-sets";
import { validateInstrumentAnswers } from "./response-validation";

const pamAnswers = { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2 };
const promsAnswers = { "proms-1": 3, "proms-2": 3, "proms-3": 3, "proms-4": 3 };

describe("R2-C instrument answer validation", () => {
  it("accepts every PAM answer exactly once and returns them in question order", () => {
    const result = validateInstrumentAnswers(
      { answers: { "pam-5": 4, "pam-1": 1, "pam-3": 2, "pam-2": 3, "pam-4": 4 } },
      CURRENT_INSTRUMENT_QUESTION_SETS.PAM,
    );

    expect(Object.keys(result)).toEqual(["pam-1", "pam-2", "pam-3", "pam-4", "pam-5"]);
  });

  it.each([
    ["an unanswered PAM question", { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2 }],
    ["an unknown question", { ...pamAnswers, "pam-unknown": 2 }],
    ["a PAM answer outside 1-4", { ...pamAnswers, "pam-1": 5 }],
  ])("refuses %s", (_label, answers) => {
    expect(() => validateInstrumentAnswers({ answers }, CURRENT_INSTRUMENT_QUESTION_SETS.PAM)).toThrow();
  });

  it("refuses an unanswered PROMs question and a PROMs answer outside 1-5 (Q1)", () => {
    expect(() =>
      validateInstrumentAnswers({ answers: { "proms-1": 3, "proms-2": 3, "proms-3": 3 } }, CURRENT_INSTRUMENT_QUESTION_SETS.PROMS),
    ).toThrow();
    expect(() =>
      validateInstrumentAnswers({ answers: { ...promsAnswers, "proms-4": 6 } }, CURRENT_INSTRUMENT_QUESTION_SETS.PROMS),
    ).toThrow();
    expect(validateInstrumentAnswers({ answers: promsAnswers }, CURRENT_INSTRUMENT_QUESTION_SETS.PROMS)).toEqual(promsAnswers);
  });

  it("refuses the legacy combined shape", () => {
    expect(() =>
      validateInstrumentAnswers(
        { pam: pamAnswers, proms: promsAnswers, confidenceScore: 7 },
        CURRENT_INSTRUMENT_QUESTION_SETS.PAM,
      ),
    ).toThrow();
  });
});
