export type ScreeningQuestionSection = "PAM" | "PROMs";

export type ScreeningAnswerOption = {
  value: number;
  label: string;
};

export type ScreeningQuestion = {
  key: string;
  section: ScreeningQuestionSection;
  prompt: string;
  minAnswer: number;
  maxAnswer: number;
  required: true;
  options: readonly ScreeningAnswerOption[];
};

export type ScreeningQuestionSet = {
  key: string;
  version: string;
  label: string;
  questions: readonly ScreeningQuestion[];
};
