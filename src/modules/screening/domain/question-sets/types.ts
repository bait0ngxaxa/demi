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

export type ScreeningQuestionSet = {
  key: string;
  version: string;
  label: string;
  questions: readonly ScreeningQuestion[];
};
