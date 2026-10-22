export type ScreeningQuestionSection = "PAM" | "PROMs";

export type ScreeningQuestionScoreDirection = "HIGHER_IS_BETTER";

export type ScreeningAnswerOption = {
  value: number;
  label: string;
};

type ScreeningQuestionBase = {
  key: string;
  prompt: string;
  minAnswer: number;
  maxAnswer: number;
  required: true;
  options: readonly ScreeningAnswerOption[];
};

export type ScreeningQuestion =
  | (ScreeningQuestionBase & {
      section: "PAM";
      scoreDirection?: never;
    })
  | (ScreeningQuestionBase & {
      section: "PROMs";
      scoreDirection: ScreeningQuestionScoreDirection;
    });

/** The legacy combined PAM+PROMs set (legacy-prototype-v1); readable, no longer submitted. */
export type ScreeningQuestionSet = {
  key: string;
  version: string;
  label: string;
  questions: readonly ScreeningQuestion[];
};

/** R2-C: PAM and PROMs are separate instruments with their own versioned question sets. */
export type ScreeningInstrumentCode = "PAM" | "PROMS";

export type InstrumentQuestion = ScreeningQuestionBase & {
  /** Shown under the question for everyone. */
  hint?: string;
  /** Assessor guidance (R2-B): for the recorder only, never in the patient view. */
  guidance?: string;
};

export type InstrumentQuestionSet = {
  key: string;
  version: string;
  instrument: ScreeningInstrumentCode;
  title: string;
  intro: readonly string[];
  /** Scale legend shown above the questions, if any. */
  scaleLabel: string | null;
  questions: readonly InstrumentQuestion[];
};
