"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";

import {
  changeAuthenticatedUserPassword,
} from "../services/password-change-service";
import {
  completePatientAccountRecovery,
  getPatientAccountRecoveryAvailability,
  issuePatientAccountRecovery,
} from "../services/account-recovery-service";
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
    await changeAuthenticatedUserPassword(actor, Object.fromEntries(formData.entries()));
    revalidatePath("/app/personal/password");

    return { status: "SUCCESS", message: "เปลี่ยนรหัสผ่านของบัญชี DEMI แล้ว" };
  } catch {
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
