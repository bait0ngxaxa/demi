"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";
import { trustedClientIpAddress } from "@/shared/http/trusted-client-ip";
import type { ServerSearchPageResult } from "@/shared/search/server-search-result";
import {
  getRequestLegalChannel,
  legalAcceptanceRequiredError,
  mapLegalVersionError,
  readLegalAcceptanceFromForm,
} from "@/modules/legal/transport/legal-request";

import { assertHospitalOnboardingCapability, HOSPITAL_ONBOARDING_CAPABILITIES } from "../policies/hospital-onboarding-policy";
import {
  approveHospitalOnboarding,
  rejectHospitalOnboarding,
  submitHospitalOnboarding,
} from "../services/hospital-onboarding-service";
import { hospitalOnboardingSubmissionSchema } from "../schemas/hospital-onboarding-schemas";
import {
  OnboardingHospitalSearchRateLimitedError,
  searchOnboardingHospitals,
  type OnboardingHospitalOption,
} from "../services/onboarding-hospital-service";
import type {
  HospitalOnboardingFieldErrors,
  HospitalOnboardingReviewActionState,
  HospitalOnboardingSubmitActionState,
} from "./action-state";
import {
  HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_CLIENT,
  HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_FIELD,
} from "./action-state";

function getSubmissionFieldErrors(
  issues: readonly { path: readonly unknown[] }[],
): HospitalOnboardingFieldErrors {
  const fieldErrors: HospitalOnboardingFieldErrors = {};

  for (const issue of issues) {
    const field = issue.path[0];

    if (field === "hospitalCode" && !fieldErrors.hospitalCode) {
      fieldErrors.hospitalCode = "กรุณาเลือกโรงพยาบาลจากรายการ";
    } else if (field === "nationalId" && !fieldErrors.nationalId) {
      fieldErrors.nationalId = "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง";
    } else if (field === "givenName" && !fieldErrors.givenName) {
      fieldErrors.givenName = "กรุณากรอกชื่อ";
    } else if (field === "familyName" && !fieldErrors.familyName) {
      fieldErrors.familyName = "กรุณากรอกนามสกุล";
    } else if (field === "password" && !fieldErrors.password) {
      fieldErrors.password = "รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร";
    } else if (field === "passwordConfirmation" && !fieldErrors.passwordConfirmation) {
      fieldErrors.passwordConfirmation = "กรุณายืนยันรหัสผ่านให้ตรงกัน";
    } else if (field === "acceptLegal" && !fieldErrors.acceptLegal) {
      fieldErrors.acceptLegal = legalAcceptanceRequiredError().message;
    }
  }

  return fieldErrors;
}

function mapPublicSubmissionError(error: unknown): HospitalOnboardingSubmitActionState {
  const legalError = mapLegalVersionError(error);
  if (legalError?.code === "LEGAL_VERSION_CHANGED") {
    return { status: "ERROR", code: "LEGAL_VERSION_CHANGED", message: legalError.message };
  }

  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        status: "ERROR",
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        status: "ERROR",
        code: "CONFLICT",
        message: "ไม่สามารถส่งคำขอนี้ได้ กรุณาตรวจสอบข้อมูลหรือติดต่อผู้ดูแลระบบ DEMI",
      };
    }
  }

  return {
    status: "ERROR",
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมรับคำขอในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function mapReviewError(error: unknown): HospitalOnboardingReviewActionState {
  if (error instanceof ApplicationError && error.code === "CONFLICT") {
    return {
      status: "ERROR",
      code: "CONFLICT",
      message: "คำขอนี้ถูกดำเนินการไปแล้วหรือไม่อยู่ในสถานะที่ดำเนินการได้",
    };
  }

  if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
    return {
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการตรวจสอบคำขอ",
    };
  }

  if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
    return {
      status: "ERROR",
      code: "NOT_FOUND",
      message: "ไม่พบคำขอที่ต้องการตรวจสอบ",
    };
  }

  if (error instanceof ApplicationError && error.code === "VALIDATION") {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบเหตุผลที่ปฏิเสธให้ถูกต้อง",
    };
  }

  return {
    status: "ERROR",
    code: "UNAVAILABLE",
    message: "ระบบยังยืนยันผลการตรวจสอบคำขอไม่ได้ กรุณาโหลดสถานะล่าสุดก่อนดำเนินการต่อ",
  };
}

function isEnhancedClientResponse(formData: FormData): boolean {
  return formData.get(HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_FIELD) ===
    HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_CLIENT;
}

function getSuccessfulReviewResult(
  formData: FormData,
  decision: "APPROVED" | "REJECTED",
): HospitalOnboardingReviewActionState | null {
  return isEnhancedClientResponse(formData) ? { status: "SUCCESS", decision } : null;
}

export async function submitHospitalOnboardingAction(
  _previousState: HospitalOnboardingSubmitActionState,
  formData: FormData,
): Promise<HospitalOnboardingSubmitActionState> {
  assertHospitalOnboardingCapability(null, HOSPITAL_ONBOARDING_CAPABILITIES.onboard);

  const parsed = hospitalOnboardingSubmissionSchema.safeParse({
    hospitalCode: formData.get("hospitalCode"),
    nationalId: formData.get("nationalId"),
    givenName: formData.get("givenName"),
    familyName: formData.get("familyName"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
    acceptLegal: readLegalAcceptanceFromForm(formData),
    channel: await getRequestLegalChannel(),
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      fieldErrors: getSubmissionFieldErrors(parsed.error.issues),
    };
  }

  try {
    await submitHospitalOnboarding(parsed.data);
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapPublicSubmissionError(error);
  }
}

async function resolveReviewActor() {
  const actor = await getProtectedApplicationActor();
  assertHospitalOnboardingCapability(actor, HOSPITAL_ONBOARDING_CAPABILITIES.review);
  return actor;
}

export async function approveHospitalOnboardingAction(
  applicationId: string,
  _previousState: HospitalOnboardingReviewActionState,
  formData: FormData,
): Promise<HospitalOnboardingReviewActionState> {
  void _previousState;
  let actor;

  try {
    actor = await resolveReviewActor();
    assertHospitalOnboardingCapability(actor, HOSPITAL_ONBOARDING_CAPABILITIES.approve);
    await approveHospitalOnboarding({ applicationId, reviewerUserId: actor.userId });
  } catch (error: unknown) {
    unstable_rethrow(error);
    return mapReviewError(error);
  }

  revalidatePath("/app/admin/hospital-onboarding");
  revalidatePath(`/app/admin/hospital-onboarding/${applicationId}`);
  const result = getSuccessfulReviewResult(formData, "APPROVED");
  if (result) {
    return result;
  }

  redirect(`/app/admin/hospital-onboarding/${applicationId}`);
}

export async function rejectHospitalOnboardingAction(
  applicationId: string,
  _previousState: HospitalOnboardingReviewActionState,
  formData: FormData,
): Promise<HospitalOnboardingReviewActionState> {
  let actor;

  try {
    actor = await resolveReviewActor();
    assertHospitalOnboardingCapability(actor, HOSPITAL_ONBOARDING_CAPABILITIES.reject);
    await rejectHospitalOnboarding({
      applicationId,
      reviewerUserId: actor.userId,
      rejectionReason: formData.get("rejectionReason")?.toString(),
    });
  } catch (error: unknown) {
    unstable_rethrow(error);
    return mapReviewError(error);
  }

  revalidatePath("/app/admin/hospital-onboarding");
  revalidatePath(`/app/admin/hospital-onboarding/${applicationId}`);
  const result = getSuccessfulReviewResult(formData, "REJECTED");
  if (result) {
    return result;
  }

  redirect(`/app/admin/hospital-onboarding/${applicationId}`);
}

/** Public: at most ten onboardable Parents by name or code; rate limited per client IP. */
export async function searchOnboardingHospitalsAction(value: string): Promise<ServerSearchPageResult<OnboardingHospitalOption>> {
  try {
    const ipAddress = trustedClientIpAddress(await headers());
    if (!ipAddress) {
      // Fail closed: without a trusted client IP the search cannot be rate limited.
      console.warn("onboarding search without trusted client IP");
      return { status: "ERROR", message: "ระบบค้นหาโรงพยาบาลไม่พร้อมใช้งานในขณะนี้" };
    }
    const items = await searchOnboardingHospitals(value, { ipAddress });
    return { status: "OK", items, page: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false };
  } catch (error: unknown) {
    if (error instanceof OnboardingHospitalSearchRateLimitedError) {
      return { status: "ERROR", message: "ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง" };
    }
    if (error instanceof ApplicationError && error.code === "VALIDATION") {
      return { status: "ERROR", message: "กรุณาพิมพ์ชื่อหรือรหัสโรงพยาบาลอย่างน้อย 2 ตัวอักษร (ไม่เกิน 100 ตัวอักษร)" };
    }
    return { status: "ERROR", message: "ไม่สามารถค้นหาโรงพยาบาลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" };
  }
}
