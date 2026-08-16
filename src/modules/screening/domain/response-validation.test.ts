import { describe, expect, it } from "vitest";

import { getPrototypeQuestionSet } from "./question-sets";
import { validateScreeningResponses } from "./response-validation";

function validResponses() {
  return {
    pam: {
      "pam-1": 2,
      "pam-2": 2,
      "pam-3": 2,
      "pam-4": 2,
      "pam-5": 2,
    },
    proms: {
      "proms-1": 3,
      "proms-2": 3,
      "proms-3": 3,
      "proms-4": 3,
    },
    confidenceScore: 7,
    confidenceImprovementPlan: "ขอข้อมูลเพิ่มเติมเกี่ยวกับการดูแลตนเอง",
  };
}

describe("Screening response validation", () => {
  it("accepts the exact prototype membership and normalizes answer order", () => {
    const responses = validResponses();
    const result = validateScreeningResponses(
      {
        ...responses,
        pam: { ...responses.pam, "pam-5": 2, "pam-1": 2 },
      },
      getPrototypeQuestionSet(),
    );

    expect(Object.keys(result.pam)).toEqual(["pam-1", "pam-2", "pam-3", "pam-4", "pam-5"]);
  });

  it.each([
    ["missing answer", { ...validResponses(), pam: { ...validResponses().pam, "pam-5": undefined } }],
    ["extra question", { ...validResponses(), pam: { ...validResponses().pam, "pam-unknown": 2 } }],
    ["out-of-range answer", { ...validResponses(), proms: { ...validResponses().proms, "proms-1": 7 } }],
  ] as const)("rejects %s", (_label, input) => {
    expect(() => validateScreeningResponses(input, getPrototypeQuestionSet())).toThrow();
  });

  it("rejects an invalid confidence score and oversized improvement plan", () => {
    const responses = validResponses();

    expect(() =>
      validateScreeningResponses(
        { ...responses, confidenceScore: 11 },
        getPrototypeQuestionSet(),
      ),
    ).toThrow();
    expect(() =>
      validateScreeningResponses(
        { ...responses, confidenceImprovementPlan: "x".repeat(1_001) },
        getPrototypeQuestionSet(),
      ),
    ).toThrow();
  });
});
