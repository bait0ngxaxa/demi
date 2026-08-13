import { describe, expect, it } from "vitest";

import { hospitalOnboardingSubmissionSchema } from "./hospital-onboarding-schemas";

const validInput = {
  hospitalCode: " kang ",
  nationalId: "1000000000009",
  givenName: "สมชาย",
  familyName: "ใจดี",
  password: "correct-horse-battery-staple",
  passwordConfirmation: "correct-horse-battery-staple",
};

describe("hospital onboarding input schema", () => {
  it("normalizes the canonical code and accepts bounded Thai applicant data", () => {
    const result = hospitalOnboardingSubmissionSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    expect(result.data?.hospitalCode).toBe("KANG");
    expect(result.data?.givenName).toBe("สมชาย");
  });

  it.each([
    { ...validInput, hospitalCode: "free text hospital" },
    { ...validInput, nationalId: "1000000000008" },
    { ...validInput, password: "short", passwordConfirmation: "short" },
    { ...validInput, passwordConfirmation: "different-password" },
    { ...validInput, role: "ADMIN" },
    { ...validInput, membershipType: "OWNER" },
  ])("rejects invalid or client-authority input", (input) => {
    expect(hospitalOnboardingSubmissionSchema.safeParse(input).success).toBe(false);
  });
});
