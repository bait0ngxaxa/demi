"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { createApplicationCredentialUrlBuilder } from "@/lib/env/server";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { signOutCurrentSession } from "@/modules/auth/services/authentication-service";
import { CurrentPasswordRejectedError, PasswordChangeProviderRejectedError } from "../adapters/supabase-account-security-provider";
import {
  PasswordChangeAttemptThrottledError,
  PasswordChangeOutcomeUncertainError,
  PasswordChangeRecoveryPendingError,
} from "../services/password-change-service";
import { trustedClientIpAddress } from "@/shared/http/trusted-client-ip";
import { ConflictError, InfrastructureError } from "@/shared/errors/application-error";

import { ProviderIdentityRejectedError } from "../adapters/supabase-account-security-provider";
import {
  changeAuthenticatedUserPassword,
} from "../services/password-change-service";
import {
  completePatientAccountRecovery,
  getPatientAccountRecoveryAvailability,
  issuePatientAccountRecovery,
} from "../services/account-recovery-service";
import {
  completeMediatedPasswordReset,
  getMediatedPasswordResetAvailability,
  issueMediatedPasswordReset,
  reconcileMediatedPasswordReset,
  revokeIssuedMediatedPasswordReset,
  searchMediatedPasswordResetTargets,
  type MediatedPasswordResetCandidate,
} from "../services/mediated-password-reset-service";
import type { MediatedPasswordResetIssueInput } from "../schemas/account-security-schemas";
import type {
  AccountRecoveryAvailabilityActionState,
  AccountRecoveryCompletionActionState,
  AccountRecoveryIssueActionState,
  PasswordChangeActionState,
} from "./action-state";

const genericAccountError = "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง";

export async function changeAuthenticatedPasswordAction(
  _previousState: PasswordChangeActionState,
  formData: FormData,
): Promise<PasswordChangeActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const result = await changeAuthenticatedUserPassword(actor, Object.fromEntries(formData.entries()), {
      clientIpAddress: trustedClientIpAddress(await headers()),
    });
    revalidatePath("/app/personal/password");

    return {
      status: "SUCCESS",
      message: result.otherSessionsRevoked
        ? "เปลี่ยนรหัสผ่านของบัญชี DEMI แล้ว"
        : "เปลี่ยนรหัสผ่านแล้ว แต่ระบบออกจากระบบในอุปกรณ์อื่นไม่สำเร็จ กรุณาออกจากระบบในอุปกรณ์เหล่านั้นด้วยตนเอง",
    };
  } catch (error: unknown) {
    if (error instanceof CurrentPasswordRejectedError) {
      return { status: "ERROR", message: "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาตรวจสอบข้อมูล", fieldErrors: { currentPassword: "รหัสผ่านปัจจุบันไม่ถูกต้อง" } };
    }
    if (error instanceof PasswordChangeAttemptThrottledError) {
      return { status: "ERROR", message: "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาตรวจสอบข้อมูล", fieldErrors: { currentPassword: "พยายามตรวจสอบรหัสผ่านปัจจุบันหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่" } };
    }
    if (error instanceof PasswordChangeProviderRejectedError) {
      return { status: "ERROR", message: "ยังไม่ได้เปลี่ยนรหัสผ่าน ระบบไม่รับรหัสผ่านใหม่นี้ กรุณาตั้งรหัสผ่านใหม่ที่ต่างจากรหัสเดิมและคาดเดายาก แล้วลองอีกครั้ง" };
    }
    if (error instanceof PasswordChangeRecoveryPendingError) {
      return { status: "ERROR", message: "ยังเปลี่ยนรหัสผ่านไม่ได้ในขณะนี้ เนื่องจากบัญชีมีการเปลี่ยนหรือกู้คืนรหัสผ่านที่ยังดำเนินการอยู่หรือรอผู้ดูแลระบบตรวจสอบ กรุณาอย่าทำรายการซ้ำ หากยังเป็นเช่นนี้ให้ติดต่อผู้ดูแลระบบ" };
    }
    if (error instanceof PasswordChangeOutcomeUncertainError) {
      return { status: "OUTCOME_UNCERTAIN", message: "ยังยืนยันผลการเปลี่ยนรหัสผ่านไม่ได้ กรุณาอย่าทำรายการซ้ำ และติดต่อผู้ดูแลระบบเพื่อตรวจสอบสถานะบัญชี" };
    }
    return { status: "ERROR", message: genericAccountError };
  }
}

export async function issuePatientAccountRecoveryAction(
  relationshipId: string,
  _previousState: AccountRecoveryIssueActionState,
  formData: FormData,
): Promise<AccountRecoveryIssueActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const result = await issuePatientAccountRecovery(actor, relationshipId, {
      nationalId: formData.get("nationalId"),
      nationalIdConfirmation: formData.get("nationalIdConfirmation"),
      identityVerified: formData.get("identityVerified") === "true",
    });

    revalidatePath(`/app/patients/${relationshipId}`);

    return {
      status: "ISSUED",
      message: "ออกลิงก์กู้คืนแล้ว ใช้ได้ 15 นาทีและใช้ได้ครั้งเดียว",
      handoffUrl: result.handoffUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch {
    return { status: "ERROR", message: genericAccountError };
  }
}

export async function checkPatientAccountRecoveryAction(
  token: string,
): Promise<AccountRecoveryAvailabilityActionState> {
  try {
    await getPatientAccountRecoveryAvailability(token);
    return { status: "READY" };
  } catch {
    return { status: "INVALID" };
  }
}

export async function completePatientAccountRecoveryAction(
  _previousState: AccountRecoveryCompletionActionState,
  formData: FormData,
): Promise<AccountRecoveryCompletionActionState> {
  try {
    await completePatientAccountRecovery({
      token: formData.get("token"),
      newPassword: formData.get("newPassword"),
      passwordConfirmation: formData.get("passwordConfirmation"),
    });

    return {
      status: "COMPLETED",
      message: "รหัสผ่านเปลี่ยนแล้ว คุณเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้",
    };
  } catch {
    return { status: "ERROR", message: genericAccountError };
  }
}

export type MediatedPasswordResetIssueActionResult =
  | { status: "ISSUED"; mode: "IN_PERSON" | "ONLINE"; handoffUrl: string; expiresAt: string }
  | { status: "ERROR"; message: string };

export async function issueMediatedPasswordResetAction(
  input: MediatedPasswordResetIssueInput,
): Promise<MediatedPasswordResetIssueActionResult> {
  try {
    const actor = await getProtectedApplicationActor();
    const recoveryUrls = createApplicationCredentialUrlBuilder("/recover");
    const result = await issueMediatedPasswordReset(actor, input);

    // IN_PERSON hands this device to the account owner, so it must not stay signed in as the issuer.
    if (result.mode === "IN_PERSON") {
      try {
        await signOutCurrentSession();
      } catch {
        try {
          await revokeIssuedMediatedPasswordReset(actor, { resetId: result.resetId });
        } catch {
          return { status: "ERROR", message: "ระบบไม่สามารถปิดเซสชันของคุณได้ จึงยกเลิกลิงก์รีเซ็ตไม่สำเร็จ ลิงก์จะหมดอายุภายใน 15 นาที" };
        }
        return { status: "ERROR", message: "ระบบไม่สามารถส่งต่ออุปกรณ์ให้เจ้าของบัญชีได้ กรุณาลองใหม่อีกครั้ง" };
      }
    }

    revalidatePath("/app/users");
    return { status: "ISSUED", mode: result.mode, handoffUrl: recoveryUrls.build(result.token), expiresAt: result.expiresAt.toISOString() };
  } catch {
    return { status: "ERROR", message: genericAccountError };
  }
}

export type MediatedPasswordResetSearchActionResult =
  | { status: "MATCH"; candidates: MediatedPasswordResetCandidate[] }
  | { status: "NO_MATCH" }
  | { status: "ERROR"; message: string };

export async function searchMediatedPasswordResetTargetsAction(
  nationalId: string,
  hospitalId?: string,
): Promise<MediatedPasswordResetSearchActionResult> {
  try {
    const actor = await getProtectedApplicationActor();
    const candidates = await searchMediatedPasswordResetTargets(actor, { nationalId }, undefined, {
      ...(hospitalId ? { hospitalId } : {}),
      clientIpAddress: trustedClientIpAddress(await headers()),
    });
    return candidates.length > 0 ? { status: "MATCH", candidates } : { status: "NO_MATCH" };
  } catch {
    return { status: "ERROR", message: genericAccountError };
  }
}

export type MediatedPasswordResetAvailabilityActionResult =
  | { status: "READY"; expiresAt: string; mode: "IN_PERSON" | "ONLINE"; confirmationKind: "THAI_NATIONAL_ID" | "PLATFORM_ADMIN_IDENTIFIER" }
  | { status: "INVALID" };

export async function checkMediatedPasswordResetAction(token: string): Promise<MediatedPasswordResetAvailabilityActionResult> {
  try {
    const availability = await getMediatedPasswordResetAvailability(token);
    return {
      status: "READY",
      expiresAt: availability.expiresAt.toISOString(),
      mode: availability.mode,
      confirmationKind: availability.confirmationKind,
    };
  } catch {
    return { status: "INVALID" };
  }
}

export async function completeMediatedPasswordResetAction(
  _previousState: AccountRecoveryCompletionActionState,
  formData: FormData,
): Promise<AccountRecoveryCompletionActionState> {
  try {
    await completeMediatedPasswordReset({
      token: formData.get("token"),
      ...(typeof formData.get("nationalId") === "string" ? { nationalId: formData.get("nationalId") } : {}),
      ...(typeof formData.get("platformAdminIdentifier") === "string"
        ? { platformAdminIdentifier: formData.get("platformAdminIdentifier") }
        : {}),
      newPassword: formData.get("newPassword"),
      passwordConfirmation: formData.get("passwordConfirmation"),
    }, { clientIpAddress: trustedClientIpAddress(await headers()) });
    return { status: "COMPLETED", message: "รหัสผ่านบัญชี DEMI เปลี่ยนแล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้" };
  } catch (error: unknown) {
    if (error instanceof ProviderIdentityRejectedError) {
      return error.reason === "PASSWORD_POLICY"
        ? {
            status: "ERROR",
            message: "ยังไม่ได้เปลี่ยนรหัสผ่าน กรุณาตั้งรหัสผ่านใหม่แล้วลองอีกครั้งด้วยลิงก์เดิม",
            fieldErrors: { newPassword: "รหัสผ่านนี้ไม่ผ่านนโยบายความปลอดภัย กรุณาตั้งรหัสผ่านที่คาดเดายากกว่านี้" },
          }
        : { status: "ERROR", message: "ยังไม่ได้เปลี่ยนรหัสผ่าน กรุณาลองอีกครั้งด้วยลิงก์เดิม" };
    }
    return { status: "ERROR", message: "ยืนยันตัวตนไม่สำเร็จ ลิงก์อาจหมดอายุหรือใช้ครบจำนวนครั้งแล้ว กรุณาติดต่อโรงพยาบาล" };
  }
}

export type MediatedPasswordResetReconcileActionResult =
  | { status: "SUCCESS"; outcome: "COMPLETED" | "ROLLED_BACK" }
  | { status: "ERROR"; message: string };

export async function reconcileMediatedPasswordResetAction(resetId: string): Promise<MediatedPasswordResetReconcileActionResult> {
  try {
    const actor = await getProtectedApplicationActor();
    const result = await reconcileMediatedPasswordReset(actor, { resetId });
    revalidatePath("/app/admin/recovery");
    return { status: "SUCCESS", outcome: result.outcome };
  } catch (error: unknown) {
    if (error instanceof InfrastructureError) {
      return { status: "ERROR", message: "ยังยืนยันสถานะกับผู้ให้บริการยืนยันตัวตนไม่ได้ บัญชียังถูกกักไว้ กรุณาลองอีกครั้งภายหลัง" };
    }
    if (error instanceof ConflictError) {
      return { status: "ERROR", message: "สถานะบัญชีกับผู้ให้บริการยืนยันตัวตนไม่ตรงกับผลที่แก้ไขได้อัตโนมัติ บัญชียังถูกกักไว้ ต้องตรวจสอบตามคู่มือ" };
    }
    return { status: "ERROR", message: genericAccountError };
  }
}
