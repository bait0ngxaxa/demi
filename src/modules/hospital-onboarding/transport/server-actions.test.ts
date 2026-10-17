import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_CLIENT,
  HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_FIELD,
  initialHospitalOnboardingReviewActionState,
  initialHospitalOnboardingSubmitActionState,
} from "./action-state";
import {
  approveHospitalOnboardingAction,
  rejectHospitalOnboardingAction,
  submitHospitalOnboardingAction,
} from "./server-actions";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  submit: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  navigationSignal: new Error("next navigation signal"),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: mocks.redirect,
  unstable_rethrow(error: unknown): void {
    if (error === mocks.navigationSignal) {
      throw error;
    }
  },
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.actor,
}));

vi.mock("../services/hospital-onboarding-service", () => ({
  approveHospitalOnboarding: mocks.approve,
  rejectHospitalOnboarding: mocks.reject,
  submitHospitalOnboarding: mocks.submit,
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

const APPLICATION_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ACTOR = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

function createReviewFormData(enhanced = true, rejectionReason?: string): FormData {
  const formData = new FormData();
  if (enhanced) {
    formData.set(
      HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_FIELD,
      HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_CLIENT,
    );
  }
  if (rejectionReason !== undefined) {
    formData.set("rejectionReason", rejectionReason);
  }
  return formData;
}

describe("hospital onboarding Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue(ADMIN_ACTOR);
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error("redirect:" + path);
    });
  });

  it("passes a complete browser FormData payload to the application service", async () => {
    mocks.submit.mockResolvedValue({
      applicationId: "33333333-3333-4333-8333-333333333333",
      applicantUserId: "22222222-2222-4222-8222-222222222222",
    });

    const result = await submitHospitalOnboardingAction(
      initialHospitalOnboardingSubmitActionState,
      createSubmissionFormData(),
    );

    expect(result).toEqual({ status: "SUCCESS" });
    expect(mocks.submit).toHaveBeenCalledWith(validSubmission);
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
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});

describe("hospital onboarding review Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue(ADMIN_ACTOR);
    mocks.approve.mockResolvedValue({ applicationId: APPLICATION_ID });
    mocks.reject.mockResolvedValue({ applicationId: APPLICATION_ID });
  });

  it("returns approval success to an enhanced client only after service and revalidation complete", async () => {
    const result = await approveHospitalOnboardingAction(
      APPLICATION_ID,
      initialHospitalOnboardingReviewActionState,
      createReviewFormData(),
    );

    expect(result).toEqual({ status: "SUCCESS", decision: "APPROVED" });
    expect(mocks.actor).toHaveBeenCalledTimes(1);
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({
      applicationId: APPLICATION_ID,
      reviewerUserId: ADMIN_ACTOR.userId,
    });
    expect(mocks.approve.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revalidatePath.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(1, "/app/admin/hospital-onboarding");
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(
      2,
      "/app/admin/hospital-onboarding/" + APPLICATION_ID,
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("preserves the native approval redirect when the enhanced response marker is absent", async () => {
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error("redirect:" + path);
    });

    await expect(
      approveHospitalOnboardingAction(
        APPLICATION_ID,
        initialHospitalOnboardingReviewActionState,
        createReviewFormData(false),
      ),
    ).rejects.toThrow("redirect:/app/admin/hospital-onboarding/" + APPLICATION_ID);

    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(
      "/app/admin/hospital-onboarding/" + APPLICATION_ID,
    );
  });

  it("returns rejection success and passes the exact rejection reason to the single service call", async () => {
    const rejectionReason = "เอกสารประกอบยังไม่ครบ";
    const result = await rejectHospitalOnboardingAction(
      APPLICATION_ID,
      initialHospitalOnboardingReviewActionState,
      createReviewFormData(true, rejectionReason),
    );

    expect(result).toEqual({ status: "SUCCESS", decision: "REJECTED" });
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith({
      applicationId: APPLICATION_ID,
      reviewerUserId: ADMIN_ACTOR.userId,
      rejectionReason,
    });
    expect(mocks.reject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revalidatePath.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("preserves the native rejection redirect when the enhanced response marker is absent", async () => {
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error("redirect:" + path);
    });

    await expect(
      rejectHospitalOnboardingAction(
        APPLICATION_ID,
        initialHospitalOnboardingReviewActionState,
        createReviewFormData(false, "เหตุผลที่ส่งแบบฟอร์ม"),
      ),
    ).rejects.toThrow("redirect:/app/admin/hospital-onboarding/" + APPLICATION_ID);

    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith({
      applicationId: APPLICATION_ID,
      reviewerUserId: ADMIN_ACTOR.userId,
      rejectionReason: "เหตุผลที่ส่งแบบฟอร์ม",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["CONFLICT", "คำขอนี้ถูกดำเนินการไปแล้วหรือไม่อยู่ในสถานะที่ดำเนินการได้", "CONFLICT"],
    ["FORBIDDEN", "บัญชีนี้ไม่มีสิทธิ์ดำเนินการตรวจสอบคำขอ", "FORBIDDEN"],
    ["NOT_FOUND", "ไม่พบคำขอที่ต้องการตรวจสอบ", "NOT_FOUND"],
    ["VALIDATION", "กรุณาตรวจสอบเหตุผลที่ปฏิเสธให้ถูกต้อง", "INVALID_INPUT"],
    [
      "INFRASTRUCTURE",
      "ระบบยังยืนยันผลการตรวจสอบคำขอไม่ได้ กรุณาโหลดสถานะล่าสุดก่อนดำเนินการต่อ",
      "UNAVAILABLE",
    ],
  ] as const)(
    "maps approval service %s to a sanitized %s result",
    async (applicationCode, message, resultCode) => {
      const failures = {
        CONFLICT: new ConflictError("raw internal detail"),
        FORBIDDEN: new ForbiddenError("raw internal detail"),
        NOT_FOUND: new NotFoundError("raw internal detail"),
        VALIDATION: new ValidationError("raw internal detail"),
        INFRASTRUCTURE: new InfrastructureError("raw internal detail"),
      } as const;
      mocks.approve.mockRejectedValue(failures[applicationCode]);

      const result = await approveHospitalOnboardingAction(
        APPLICATION_ID,
        initialHospitalOnboardingReviewActionState,
        createReviewFormData(),
      );

      expect(result).toEqual({ status: "ERROR", code: resultCode, message });
      expect(result.status === "ERROR" && result.message).not.toContain("raw internal detail");
      expect(mocks.approve).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("maps a rejection validation error inline without treating it as unavailable", async () => {
    mocks.reject.mockRejectedValue(new ValidationError("raw reason validation"));

    const result = await rejectHospitalOnboardingAction(
      APPLICATION_ID,
      initialHospitalOnboardingReviewActionState,
      createReviewFormData(true, "x".repeat(501)),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบเหตุผลที่ปฏิเสธให้ถูกต้อง",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not let the response marker bypass review authorization", async () => {
    mocks.actor.mockResolvedValue({
      ...ADMIN_ACTOR,
      roles: [],
    });

    const result = await approveHospitalOnboardingAction(
      APPLICATION_ID,
      initialHospitalOnboardingReviewActionState,
      createReviewFormData(),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการตรวจสอบคำขอ",
    });
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rethrows navigation signals from the action path instead of mapping them as failures", async () => {
    mocks.approve.mockRejectedValue(mocks.navigationSignal);

    await expect(
      approveHospitalOnboardingAction(
        APPLICATION_ID,
        initialHospitalOnboardingReviewActionState,
        createReviewFormData(),
      ),
    ).rejects.toBe(mocks.navigationSignal);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
