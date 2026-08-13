"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import { assertHospitalOnboardingCapability, HOSPITAL_ONBOARDING_CAPABILITIES } from "../policies/hospital-onboarding-policy";
import {
  approveHospitalOnboarding,
  rejectHospitalOnboarding,
  submitHospitalOnboarding,
} from "../services/hospital-onboarding-service";
import { hospitalOnboardingSubmissionSchema } from "../schemas/hospital-onboarding-schemas";
import type {
  HospitalOnboardingReviewActionState,
  HospitalOnboardingSubmitActionState,
} from "./action-state";

function mapPublicSubmissionError(error: unknown): HospitalOnboardingSubmitActionState {
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
        message: "ไม่สามารถส่งคำขอนี้ได้ กรุณาตรวจสอบข้อมูลหรือติดต่อผู้ดูแลระบบ",
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
      message: "คำขอนี้ถูกดำเนินการไปแล้วหรือไม่อยู่ในสถานะที่ดำเนินการได้",
    };
  }

  if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
    return {
      status: "ERROR",
      message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการตรวจสอบคำขอ",
    };
  }

  if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
    return {
      status: "ERROR",
      message: "ไม่พบคำขอที่ต้องการตรวจสอบ",
    };
  }

  return {
    status: "ERROR",
    message: "ระบบไม่สามารถบันทึกผลการตรวจสอบได้ กรุณาลองใหม่อีกครั้ง",
  };
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
  });

  if (!parsed.success) {
    return mapPublicSubmissionError(new ApplicationError("VALIDATION", "Invalid onboarding data"));
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
  _formData: FormData,
): Promise<HospitalOnboardingReviewActionState> {
  void _previousState;
  void _formData;
  let actor;

  try {
    actor = await resolveReviewActor();
    assertHospitalOnboardingCapability(actor, HOSPITAL_ONBOARDING_CAPABILITIES.approve);
    await approveHospitalOnboarding({ applicationId, reviewerUserId: actor.userId });
  } catch (error: unknown) {
    return mapReviewError(error);
  }

  revalidatePath("/app/admin/hospital-onboarding");
  revalidatePath(`/app/admin/hospital-onboarding/${applicationId}`);
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
    return mapReviewError(error);
  }

  revalidatePath("/app/admin/hospital-onboarding");
  revalidatePath(`/app/admin/hospital-onboarding/${applicationId}`);
  redirect(`/app/admin/hospital-onboarding/${applicationId}`);
}
