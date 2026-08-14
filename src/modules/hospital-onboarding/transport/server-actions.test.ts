import { beforeEach, describe, expect, it, vi } from "vitest";

import { initialHospitalOnboardingSubmitActionState } from "./action-state";
import { submitHospitalOnboardingAction } from "./server-actions";

const mockedSubmitHospitalOnboarding = vi.hoisted(() => vi.fn());

vi.mock("../services/hospital-onboarding-service", () => ({
  approveHospitalOnboarding: vi.fn(),
  rejectHospitalOnboarding: vi.fn(),
  submitHospitalOnboarding: mockedSubmitHospitalOnboarding,
}));

const validSubmission = {
  hospitalCode: "KANG",
  nationalId: "1000000000009",
  givenName: "สมชาย",
  familyName: "ใจดี",
  password: "correct-horse-battery-staple",
  passwordConfirmation: "correct-horse-battery-staple",
};

function createSubmissionFormData(
  overrides: Partial<typeof validSubmission> = {},
): FormData {
  const values = { ...validSubmission, ...overrides };
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

describe("hospital onboarding Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a complete browser FormData payload to the application service", async () => {
    mockedSubmitHospitalOnboarding.mockResolvedValue({
      applicationId: "33333333-3333-4333-8333-333333333333",
      applicantUserId: "22222222-2222-4222-8222-222222222222",
    });

    const result = await submitHospitalOnboardingAction(
      initialHospitalOnboardingSubmitActionState,
      createSubmissionFormData(),
    );

    expect(result).toEqual({ status: "SUCCESS" });
    expect(mockedSubmitHospitalOnboarding).toHaveBeenCalledWith(validSubmission);
  });

  it("identifies invalid fields without calling the application service", async () => {
    const result = await submitHospitalOnboardingAction(
      initialHospitalOnboardingSubmitActionState,
      createSubmissionFormData({ hospitalCode: "" }),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      fieldErrors: {
        hospitalCode: "กรุณาเลือกโรงพยาบาลจากรายการ",
      },
    });
    expect(mockedSubmitHospitalOnboarding).not.toHaveBeenCalled();
  });
});
