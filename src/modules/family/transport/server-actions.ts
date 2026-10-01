"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  acceptCaregiverInvitation,
  createCaregiverInvitation,
  previewCaregiverInvitation,
  rejectCaregiverInvitation,
  revokeCaregiverRelationship,
  revokePendingCaregiverInvitation,
  withdrawOwnCaregiverRelationship,
} from "../services/caregiver-relationship-service";
import {
  caregiverInvitationIdSchema,
  caregiverInvitationTokenSchema,
  caregiverRelationshipIdSchema,
  createCaregiverInvitationInputSchema,
} from "../schemas/caregiver-relationship-schemas";
import type {
  CaregiverInvitationPreviewActionState,
  CreateCaregiverInvitationActionState,
  FamilyMutationActionState,
} from "./action-state";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function safeMutationError(error: unknown): FamilyMutationActionState {
  if (error instanceof ApplicationError) {
    if (error.code === "FORBIDDEN") {
      return { status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับรายการนี้" };
    }
    if (error.code === "NOT_FOUND") {
      return { status: "ERROR", message: "ไม่พบรายการที่ต้องการดำเนินการ" };
    }
    if (error.code === "CONFLICT") {
      return {
        status: "ERROR",
        message: "สถานะรายการเปลี่ยนไปหรือหมดอายุแล้ว กรุณาตรวจสอบรายการอีกครั้ง",
      };
    }
    if (error.code === "VALIDATION") {
      return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง" };
    }
  }

  return { status: "ERROR", message: "ระบบไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง" };
}

export async function createCaregiverInvitationAction(
  _previousState: CreateCaregiverInvitationActionState,
  formData: FormData,
): Promise<CreateCaregiverInvitationActionState> {
  const parsed = createCaregiverInvitationInputSchema.safeParse({
    nationalId: formString(formData, "nationalId"),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "กรุณาตรวจสอบเลขบัตรประชาชนให้ถูกต้อง" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const invitation = await createCaregiverInvitation(actor, parsed.data);
    revalidatePath("/app/family");

    return {
      status: "SUCCESS",
      token: invitation.plaintextToken,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
      return { status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์สร้างคำเชิญในพื้นที่ผู้ป่วย" };
    }
    if (
      error instanceof ApplicationError &&
      (error.code === "CONFLICT" || error.code === "NOT_FOUND")
    ) {
      return { status: "ERROR", message: "ไม่สามารถสร้างคำเชิญสำหรับข้อมูลนี้ได้" };
    }
    if (error instanceof ApplicationError && error.code === "VALIDATION") {
      return { status: "ERROR", message: "กรุณาตรวจสอบเลขบัตรประชาชนให้ถูกต้อง" };
    }

    return { status: "ERROR", message: "ระบบไม่สามารถสร้างคำเชิญได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" };
  }
}

export async function previewCaregiverInvitationAction(
  plaintextToken: unknown,
): Promise<CaregiverInvitationPreviewActionState> {
  const parsedToken = caregiverInvitationTokenSchema.safeParse(plaintextToken);

  if (!parsedToken.success) {
    return { status: "INVALID", message: "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const invitation = await previewCaregiverInvitation(actor, parsedToken.data);

    return {
      status: "READY",
      invitation: {
        invitationStatus: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        patientDisplayName: invitation.patientDisplayName,
        acceptanceContractVersion: invitation.acceptanceContractVersion,
      },
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
      return { status: "NOT_RECIPIENT", message: "บัญชีนี้ไม่ใช่ผู้รับคำเชิญนี้" };
    }
    if (error instanceof ApplicationError && error.code === "UNAUTHENTICATED") {
      return { status: "NEEDS_LOGIN", message: "กรุณาเข้าสู่ระบบด้วยบัญชีผู้รับคำเชิญ" };
    }
    if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
      return { status: "INVALID", message: "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน" };
    }

    return { status: "ERROR", message: "ไม่สามารถตรวจสอบคำเชิญได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" };
  }
}

export async function acceptCaregiverInvitationAction(
  _previousState: FamilyMutationActionState,
  formData: FormData,
): Promise<FamilyMutationActionState> {
  const parsed = caregiverInvitationTokenSchema.safeParse(formString(formData, "token"));
  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await acceptCaregiverInvitation(actor, parsed.data);
    revalidatePath("/app/family");
    revalidatePath("/app/family/invitations");
    return { status: "SUCCESS", message: "ยอมรับคำเชิญและเชื่อมความสัมพันธ์แล้ว" };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
      return { status: "ERROR", message: "บัญชีนี้ไม่ใช่ผู้รับคำเชิญนี้" };
    }
    return safeMutationError(error);
  }
}

export async function rejectCaregiverInvitationAction(
  _previousState: FamilyMutationActionState,
  formData: FormData,
): Promise<FamilyMutationActionState> {
  const parsed = caregiverInvitationTokenSchema.safeParse(formString(formData, "token"));
  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await rejectCaregiverInvitation(actor, parsed.data);
    revalidatePath("/app/family");
    revalidatePath("/app/family/invitations");
    return { status: "SUCCESS", message: "ปฏิเสธคำเชิญแล้ว" };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
      return { status: "ERROR", message: "บัญชีนี้ไม่ใช่ผู้รับคำเชิญนี้" };
    }
    return safeMutationError(error);
  }
}

export async function revokePendingCaregiverInvitationAction(
  _previousState: FamilyMutationActionState,
  formData: FormData,
): Promise<FamilyMutationActionState> {
  const parsed = caregiverInvitationIdSchema.safeParse({
    invitationId: formString(formData, "invitationId"),
  });
  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบคำเชิญที่ต้องการถอน" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await revokePendingCaregiverInvitation(actor, parsed.data.invitationId);
    revalidatePath("/app/family");
    return { status: "SUCCESS", message: "ยกเลิกคำเชิญแล้ว" };
  } catch (error: unknown) {
    return safeMutationError(error);
  }
}

export async function revokeCaregiverRelationshipAction(
  _previousState: FamilyMutationActionState,
  formData: FormData,
): Promise<FamilyMutationActionState> {
  const parsed = caregiverRelationshipIdSchema.safeParse({
    relationshipId: formString(formData, "relationshipId"),
  });
  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบความสัมพันธ์ที่ต้องการยุติ" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await revokeCaregiverRelationship(actor, parsed.data.relationshipId);
    revalidatePath("/app/family");
    return { status: "SUCCESS", message: "ยุติความสัมพันธ์ผู้ดูแลแล้ว" };
  } catch (error: unknown) {
    return safeMutationError(error);
  }
}

export async function withdrawOwnCaregiverRelationshipAction(
  _previousState: FamilyMutationActionState,
  formData: FormData,
): Promise<FamilyMutationActionState> {
  const parsed = caregiverRelationshipIdSchema.safeParse({
    relationshipId: formString(formData, "relationshipId"),
  });
  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบความสัมพันธ์ที่ต้องการยุติ" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await withdrawOwnCaregiverRelationship(actor, parsed.data.relationshipId);
    revalidatePath("/app/family");
    return { status: "SUCCESS", message: "หยุดการเป็นผู้ดูแลแล้ว" };
  } catch (error: unknown) {
    return safeMutationError(error);
  }
}
