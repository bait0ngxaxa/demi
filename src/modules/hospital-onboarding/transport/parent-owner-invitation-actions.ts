"use server";

import { revalidatePath } from "next/cache";

import {
  createWorkforceActivationUrlBuilder,
  isApplicationPublicOriginConfigurationError,
} from "@/lib/env/server";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type {
  ChildOwnerInvitationActionState,
  HospitalNetworkActionState,
} from "@/modules/hospital-service-areas/transport/action-state";
import type { HospitalOwnerInvitationIssue } from "@/modules/workforce/services/hospital-owner-invitation";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  cancelParentOwnerInvitation,
  changeParentOwnerInvitee,
  inviteParentOwner,
  issueParentOwnerLink,
  revokeParentOwnerLink,
} from "../services/parent-owner-invitation-service";

// ADR-0024: platform ADMIN invites the first or replacement OWNER of a Parent Hospital. The invitation result reuses
// the Child OWNER invitation action state, so the same form and one-time result components render it.

type ErrorState = Extract<HospitalNetworkActionState, { status: "ERROR" }>;
type ErrorCopy = Partial<Record<ErrorState["code"], string>>;

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function toErrorState(error: unknown, copy: ErrorCopy): ErrorState {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { status: "ERROR", code: "INVALID_INPUT", message: copy.INVALID_INPUT ?? "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" };
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { status: "ERROR", code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการนี้" };
    }
    if (error.code === "CONFLICT") {
      return { status: "ERROR", code: "CONFLICT", message: copy.CONFLICT ?? "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง" };
    }
    if (error.code === "NOT_FOUND") {
      return { status: "ERROR", code: "NOT_FOUND", message: "ไม่พบโรงพยาบาลนี้แล้ว กรุณาโหลดหน้าใหม่" };
    }
  }
  return { status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง" };
}

/** The ADMIN directory and every Hospital detail page share the admin layout. */
function revalidateAdminHospitals(): void {
  revalidatePath("/app/admin/hospitals", "layout");
}

const inviteeCopy: ErrorCopy = {
  INVALID_INPUT: "กรุณาตรวจสอบข้อมูล: เลขบัตรประชาชน 13 หลัก และชื่อ–นามสกุลผู้ดูแล",
  CONFLICT: "ดำเนินการไม่ได้ อาจมีคำขอขึ้นทะเบียนรอพิจารณา มีผู้ดูแลที่ใช้งานอยู่ บัญชีของผู้ถูกเชิญต้องตรวจสอบก่อน หรือข้อมูลเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่",
};

function inviteeInput(formData: FormData): Record<string, string> {
  return {
    hospitalId: getString(formData, "hospitalId"),
    nationalId: getString(formData, "nationalId"),
    givenName: getString(formData, "givenName"),
    familyName: getString(formData, "familyName"),
    mode: getString(formData, "mode") || "REMOTE",
    submissionNonce: getString(formData, "submissionNonce"),
  };
}

async function runInvitation(
  work: () => Promise<HospitalOwnerInvitationIssue>,
  message: string,
  copy: ErrorCopy,
): Promise<ChildOwnerInvitationActionState> {
  try {
    const urls = createWorkforceActivationUrlBuilder();
    const invitation = await work();
    revalidateAdminHospitals();
    return {
      status: "SUCCESS",
      message,
      completedAt: Date.now(),
      invitation: invitation.status === "ACTIVATION_LINK"
        ? {
            kind: "ACTIVATION_LINK",
            activationToken: invitation.activationToken,
            activationUrl: urls.build(invitation.activationToken),
            activationExpiresAt: invitation.activationExpiresAt.toISOString(),
            activationMode: invitation.activationMode,
          }
        : { kind: invitation.status },
    };
  } catch (error: unknown) {
    if (isApplicationPublicOriginConfigurationError(error)) {
      return {
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "ระบบยังไม่ได้ตั้งค่าที่อยู่สำหรับลิงก์เปิดใช้งาน กรุณาตรวจสอบการตั้งค่าระบบ",
      };
    }
    return toErrorState(error, copy);
  }
}

export async function inviteParentOwnerAction(
  _previous: ChildOwnerInvitationActionState,
  formData: FormData,
): Promise<ChildOwnerInvitationActionState> {
  return runInvitation(
    async () => inviteParentOwner(await getProtectedApplicationActor(), inviteeInput(formData)),
    "ส่งคำเชิญผู้ดูแลโรงพยาบาลแล้ว",
    inviteeCopy,
  );
}

export async function changeParentOwnerInviteeAction(
  _previous: ChildOwnerInvitationActionState,
  formData: FormData,
): Promise<ChildOwnerInvitationActionState> {
  return runInvitation(
    async () => changeParentOwnerInvitee(await getProtectedApplicationActor(), inviteeInput(formData)),
    "เปลี่ยนผู้ถูกเชิญแล้ว คำเชิญเดิมสิ้นสุดทันที",
    inviteeCopy,
  );
}

export async function issueParentOwnerLinkAction(
  _previous: ChildOwnerInvitationActionState,
  formData: FormData,
): Promise<ChildOwnerInvitationActionState> {
  return runInvitation(
    async () => issueParentOwnerLink(await getProtectedApplicationActor(), {
      hospitalId: getString(formData, "hospitalId"),
      mode: getString(formData, "mode") || "REMOTE",
    }),
    "ออกลิงก์เปิดใช้งานใหม่แล้ว ลิงก์เดิมใช้ไม่ได้อีก",
    { CONFLICT: "ออกลิงก์ไม่ได้ ผู้ถูกเชิญอาจกำลังเปิดใช้งาน ใช้บัญชีเดิมตอบรับ หรือข้อมูลเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่" },
  );
}

export async function cancelParentOwnerInvitationAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  try {
    await cancelParentOwnerInvitation(await getProtectedApplicationActor(), {
      hospitalId: getString(formData, "hospitalId"),
      membershipId: getString(formData, "membershipId"),
    });
    revalidateAdminHospitals();
    return { status: "SUCCESS", message: "ยกเลิกคำเชิญแล้ว โรงพยาบาลกลับไปอยู่ในรายชื่อขอขึ้นทะเบียน", completedAt: Date.now() };
  } catch (error: unknown) {
    return toErrorState(error, { CONFLICT: "ยกเลิกไม่ได้ ผู้ถูกเชิญอาจกำลังเปิดใช้งานอยู่ หรือคำเชิญเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่" });
  }
}

export async function revokeParentOwnerLinkAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  try {
    await revokeParentOwnerLink(await getProtectedApplicationActor(), { hospitalId: getString(formData, "hospitalId") });
    revalidateAdminHospitals();
    return { status: "SUCCESS", message: "ยกเลิกลิงก์หรือคำเชิญแล้ว", completedAt: Date.now() };
  } catch (error: unknown) {
    return toErrorState(error, { CONFLICT: "ยกเลิกไม่ได้ ผู้ถูกเชิญอาจกำลังเปิดใช้งานอยู่ กรุณาโหลดหน้าใหม่" });
  }
}
