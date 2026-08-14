"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOutCurrentSession } from "@/modules/auth/services/authentication-service";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  hospitalMemberProvisionSchema,
  osmProvisionSchema,
  workforceActivationCompletionSchema,
  workforceActivationRequestSchema,
} from "../schemas/workforce-schemas";
import {
  completeWorkforceActivation,
  provisionHospitalMember,
  provisionOsm,
  regenerateWorkforceActivation,
  revokeWorkforceActivation,
} from "../services/workforce-service";
import type {
  WorkforceActivationActionState,
  WorkforceCompletionActionState,
  WorkforceField,
  WorkforceProvisionActionState,
  WorkforceProvisionResultState,
} from "./action-state";

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function mapFieldErrors(
  issues: readonly { path: readonly unknown[] }[],
): Partial<Record<WorkforceField, string>> {
  const fieldErrors: Partial<Record<WorkforceField, string>> = {};

  for (const issue of issues) {
    const field = issue.path[0];

    if (typeof field === "string" && !fieldErrors[field as WorkforceField]) {
      const messages: Partial<Record<WorkforceField, string>> = {
        nationalId: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง",
        givenName: "กรุณากรอกชื่อ",
        familyName: "กรุณากรอกนามสกุล",
        targetHospitalId: "กรุณาเลือกโรงพยาบาลที่มีสิทธิ์จัดการ",
        profession: "กรุณาเลือกวิชาชีพที่กำหนด",
        userId: "ไม่พบผู้ใช้งานที่ต้องการดำเนินการ",
      };
      const message = messages[field as WorkforceField];

      if (message) {
        fieldErrors[field as WorkforceField] = message;
      }
    }
  }

  return fieldErrors;
}

function mapWorkforceError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { code: "INVALID_INPUT", message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง" };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์จัดการบุคลากรของโรงพยาบาลนี้" };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message: "ไม่สามารถดำเนินการกับบุคลากรรายนี้ได้ กรุณาตรวจสอบสถานะแล้วลองใหม่",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function mapCompletionError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { code: "INVALID_INPUT", message: "กรุณาตรวจสอบรหัสผ่านให้ถูกต้อง" };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return { code: "CONFLICT", message: "ลิงก์เปิดใช้งานไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว" };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบยังไม่สามารถเปิดใช้งานบัญชีได้ กรุณาลองใหม่หรือติดต่อผู้ดูแลโรงพยาบาล",
  };
}

function toProvisionResultState(result: Awaited<ReturnType<typeof provisionHospitalMember>>): WorkforceProvisionResultState {
  return {
    kind: result.kind,
    userId: result.userId,
    hospitalId: result.hospitalId,
    relationshipId: result.relationshipId,
    accountStatus: result.accountStatus,
    relationshipStatus: result.relationshipStatus,
    activationRequired: result.activationRequired,
    activationToken: result.activationToken,
    activationExpiresAt: result.activationExpiresAt?.toISOString() ?? null,
    activationMode: result.activationMode,
    reusedExistingUser: result.reusedExistingUser,
    idempotent: result.idempotent,
  };
}

function getProvisionInput(formData: FormData) {
  return {
    nationalId: getString(formData, "nationalId"),
    givenName: getString(formData, "givenName"),
    familyName: getString(formData, "familyName"),
    targetHospitalId: getString(formData, "targetHospitalId"),
    profession: getString(formData, "profession"),
  };
}

export async function provisionHospitalMemberAction(
  _previousState: WorkforceProvisionActionState,
  formData: FormData,
): Promise<WorkforceProvisionActionState> {
  const parsed = hospitalMemberProvisionSchema.safeParse(getProvisionInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      fieldErrors: mapFieldErrors(parsed.error.issues),
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await provisionHospitalMember(actor, parsed.data);
    revalidatePath("/app/workforce");
    return { status: "SUCCESS", result: toProvisionResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function provisionOsmAction(
  _previousState: WorkforceProvisionActionState,
  formData: FormData,
): Promise<WorkforceProvisionActionState> {
  const parsed = osmProvisionSchema.safeParse({
    nationalId: getString(formData, "nationalId"),
    givenName: getString(formData, "givenName"),
    familyName: getString(formData, "familyName"),
    targetHospitalId: getString(formData, "targetHospitalId"),
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      fieldErrors: mapFieldErrors(parsed.error.issues),
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await provisionOsm(actor, parsed.data);
    revalidatePath("/app/workforce");
    return { status: "SUCCESS", result: toProvisionResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

function getActivationRequest(formData: FormData, mode: "REMOTE" | "ASSISTED") {
  return {
    userId: getString(formData, "userId"),
    targetHospitalId: getString(formData, "targetHospitalId"),
    kind: getString(formData, "kind"),
    mode,
  };
}

function toActivationResultState(
  result: Awaited<ReturnType<typeof regenerateWorkforceActivation>>,
): WorkforceActivationActionState {
  return {
    status: "SUCCESS",
    result: {
      userId: result.userId,
      hospitalId: result.hospitalId,
      kind: result.kind,
      activationToken: result.activationToken,
      activationExpiresAt: result.activationExpiresAt.toISOString(),
      activationMode: result.activationMode,
    },
  };
}

export async function regenerateWorkforceActivationAction(
  _previousState: WorkforceActivationActionState,
  formData: FormData,
): Promise<WorkforceActivationActionState> {
  const parsed = workforceActivationRequestSchema.safeParse(
    getActivationRequest(formData, "REMOTE"),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่สามารถออกลิงก์เปิดใช้งานใหม่ได้",
      fieldErrors: mapFieldErrors(parsed.error.issues),
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await regenerateWorkforceActivation(actor, parsed.data);
    revalidatePath("/app/workforce");
    return toActivationResultState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function startAssistedWorkforceActivationAction(
  _previousState: WorkforceActivationActionState,
  formData: FormData,
): Promise<WorkforceActivationActionState> {
  const parsed = workforceActivationRequestSchema.safeParse(
    getActivationRequest(formData, "ASSISTED"),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่สามารถเริ่มการเปิดใช้งานแบบช่วยเหลือได้",
      fieldErrors: mapFieldErrors(parsed.error.issues),
    };
  }

  let actor;

  try {
    actor = await getProtectedApplicationActor();
    const result = await regenerateWorkforceActivation(actor, parsed.data);

    try {
      await signOutCurrentSession();
    } catch {
      try {
        await revokeWorkforceActivation(actor, {
          userId: parsed.data.userId,
          targetHospitalId: parsed.data.targetHospitalId,
          kind: parsed.data.kind,
        });
      } catch {
        return {
          status: "ERROR",
          code: "UNAVAILABLE",
          message: "ระบบไม่สามารถปิดเซสชันผู้ดูแลได้ จึงยกเลิกการเปิดใช้งานชั่วคราวไม่สำเร็จ",
        };
      }

      return {
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "ระบบไม่สามารถส่งต่ออุปกรณ์ให้ผู้ใช้งานได้ กรุณาลองใหม่อีกครั้ง",
      };
    }

    revalidatePath("/app/workforce");
    return toActivationResultState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function completeWorkforceActivationAction(
  token: string,
  _previousState: WorkforceCompletionActionState,
  formData: FormData,
): Promise<WorkforceCompletionActionState> {
  const parsed = workforceActivationCompletionSchema.safeParse({
    password: getString(formData, "password"),
    passwordConfirmation: getString(formData, "passwordConfirmation"),
  });

  if (!parsed.success) {
    const fieldErrors: { password?: string; passwordConfirmation?: string } = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0];

      if (field === "password" && !fieldErrors.password) {
        fieldErrors.password = "รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร";
      }

      if (field === "passwordConfirmation" && !fieldErrors.passwordConfirmation) {
        fieldErrors.passwordConfirmation = "กรุณายืนยันรหัสผ่านให้ตรงกัน";
      }
    }

    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบรหัสผ่านให้ถูกต้อง",
      fieldErrors,
    };
  }

  try {
    await completeWorkforceActivation(token, parsed.data);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapCompletionError(error) };
  }

  redirect("/login?activated=1");
}
