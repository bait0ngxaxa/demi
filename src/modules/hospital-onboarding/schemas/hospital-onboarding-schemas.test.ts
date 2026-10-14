import { afterEach, describe, expect, it, vi } from "vitest";

import { hospitalOnboardingSubmissionSchema } from "./hospital-onboarding-schemas";

const validInput = {
  hospitalCode: " kang ",
  nationalId: "1000000000009",
  givenName: "สมชาย",
  familyName: "ใจดี",
  password: "correct-horse-battery-staple",
  passwordConfirmation: "correct-horse-battery-staple",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("accepts a checksum-invalid synthetic applicant ID in production-mode UAT", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "uat");
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    expect(
      hospitalOnboardingSubmissionSchema.safeParse({
        ...validInput,
        nationalId: "1111111111111",
      }).success,
    ).toBe(true);
    expect(
      hospitalOnboardingSubmissionSchema.safeParse({
        ...validInput,
        nationalId: "9000000000000",
      }).success,
    ).toBe(false);
  });
});
