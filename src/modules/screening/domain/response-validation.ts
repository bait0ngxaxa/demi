import { ValidationError } from "@/shared/errors/application-error";

import type { InstrumentQuestionSet } from "./question-sets/types";
import { instrumentResponsesSchema } from "../schemas/screening-schemas";

/**
 * R2-A/B: every question of the instrument must be answered exactly once with one of its options.
 * Returns the answers in question order.
 */
export function validateInstrumentAnswers(
  input: unknown,
  questionSet: InstrumentQuestionSet,
): Record<string, number> {
  const parsed = instrumentResponsesSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Screening answers are invalid or incomplete");
  }

  const answers = parsed.data.answers;
  const expectedKeys = questionSet.questions.map((question) => question.key);
  const actualKeys = Object.keys(answers);

  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key) => !expectedKeys.includes(key))) {
    throw new ValidationError("กรุณาตอบแบบประเมินให้ครบทุกข้อ");
  }

  return Object.fromEntries(
    questionSet.questions.map((question) => {
      const value = answers[question.key];

      if (value === undefined || !question.options.some((option) => option.value === value)) {
        throw new ValidationError("Screening answer is outside the selected question set");
      }

      return [question.key, value];
    }),
  );
}
