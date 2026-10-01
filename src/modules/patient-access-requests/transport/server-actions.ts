"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  reviewPatientAccessRequest,
  submitPublicPatientAccessRequest,
  withdrawPatientAccessRequestByHospital,
} from "../services/patient-access-request-service";
import {
  patientAccessRequestIdSchema,
  patientAccessRequestReviewSchema,
  publicPatientAccessRequestSchema,
} from "../schemas/patient-access-request-schemas";
import type {
  PatientAccessRequestReviewActionState,
  PatientAccessRequestWithdrawalActionState,
  PublicPatientAccessRequestActionState,
} from "./action-state";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function mapPublicError(error: unknown): PublicPatientAccessRequestActionState {
  if (error instanceof ApplicationError) {
    if (error.code === "CONFLICT") {
      return { status: "SUCCESS" };
    }

    if (error.code === "VALIDATION") {
      return {
        status: "ERROR",
        message: "กรุณาตรวจสอบเลขบัตรประชาชนและโรงพยาบาลที่เลือก",
      };
    }
  }

  return {
    status: "ERROR",
    message: "ระบบไม่พร้อมรับคำขอในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function mapHospitalReviewError(error: unknown): PatientAccessRequestReviewActionState {
  if (error instanceof ApplicationError) {
    if (error.code === "FORBIDDEN") {
      return { status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์ตรวจสอบคำขอในโรงพยาบาลนี้" };
    }

    if (error.code === "NOT_FOUND") {
      return { status: "ERROR", message: "ไม่พบคำขอที่ต้องการตรวจสอบ" };
    }

    if (error.code === "CONFLICT") {
      return {
        status: "ERROR",
        message: "ตรวจยืนยันข้อมูลไม่ตรง หรือคำขอเปลี่ยนสถานะแล้ว",
      };
    }

    if (error.code === "VALIDATION") {
      return { status: "ERROR", message: "กรุณาตรวจเลขบัตรประชาชนที่ใช้ยืนยันตัวตน" };
    }
  }

  return { status: "ERROR", message: "ระบบไม่สามารถบันทึกผลได้ กรุณาลองใหม่อีกครั้ง" };
}

function mapHospitalWithdrawalError(error: unknown): PatientAccessRequestWithdrawalActionState {
  if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
    return { status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการคำขอในโรงพยาบาลนี้" };
  }

  if (error instanceof ApplicationError && error.code === "CONFLICT") {
    return { status: "ERROR", message: "คำขอนี้ดำเนินการต่อไม่ได้หรือเปลี่ยนสถานะแล้ว" };
  }

  return { status: "ERROR", message: "ระบบไม่สามารถบันทึกการถอนคำขอได้" };
}

export async function submitPublicPatientAccessRequestAction(
  _previousState: PublicPatientAccessRequestActionState,
  formData: FormData,
): Promise<PublicPatientAccessRequestActionState> {
  const parsed = publicPatientAccessRequestSchema.safeParse({
    nationalId: formString(formData, "nationalId"),
    hospitalId: formString(formData, "hospitalId"),
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      message: "กรุณาตรวจสอบเลขบัตรประชาชนและโรงพยาบาลที่เลือก",
    };
  }

  try {
    await submitPublicPatientAccessRequest(parsed.data);
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapPublicError(error);
  }
}

export async function reviewPatientAccessRequestAction(
  _previousState: PatientAccessRequestReviewActionState,
  formData: FormData,
): Promise<PatientAccessRequestReviewActionState> {
  const decision = formString(formData, "decision");
  const rawNationalId = formString(formData, "nationalId");
  const identityVerified = formString(formData, "identityVerified");
  const parsed = patientAccessRequestReviewSchema.safeParse({
    requestId: formString(formData, "requestId"),
    decision,
    ...(rawNationalId ? { nationalId: rawNationalId } : {}),
    ...(identityVerified === "true" ? { identityVerified: true } : {}),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลก่อนบันทึกผล" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await reviewPatientAccessRequest(actor, parsed.data);
    revalidatePath("/app/patients/access-requests");
    revalidatePath(`/app/patients/access-requests/${parsed.data.requestId}`);
    return {
      status: "SUCCESS",
      requestStatus: result.status,
      resolution: result.resolution,
    };
  } catch (error: unknown) {
    return mapHospitalReviewError(error);
  }
}

export async function withdrawPatientAccessRequestByHospitalAction(
  _previousState: PatientAccessRequestWithdrawalActionState,
  formData: FormData,
): Promise<PatientAccessRequestWithdrawalActionState> {
  const parsed = patientAccessRequestIdSchema.safeParse({
    requestId: formString(formData, "requestId"),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบคำขอที่ต้องการถอน" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await withdrawPatientAccessRequestByHospital(actor, parsed.data);
    revalidatePath("/app/patients/access-requests");
    revalidatePath(`/app/patients/access-requests/${parsed.data.requestId}`);
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapHospitalWithdrawalError(error);
  }
}
