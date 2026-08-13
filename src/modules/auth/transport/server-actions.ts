"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loginInputSchema } from "../schemas/login-schema";
import {
  authenticateWithPassword,
  signOutCurrentSession,
} from "../services/authentication-service";
import { resolveCurrentActorContext } from "../services/actor-context-service";
import type { ActorContext } from "../types/actor-context";
import type { LoginActionState, LogoutActionState } from "./action-state";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginInputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบอีเมลและรหัสผ่านให้ถูกต้อง",
    };
  }

  let result: Awaited<ReturnType<typeof authenticateWithPassword>>;

  try {
    result = await authenticateWithPassword(parsed.data);
  } catch {
    return {
      status: "ERROR",
      code: "AUTH_INFRASTRUCTURE_FAILURE",
      message: "ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง",
    };
  }

  if (result.status === "INVALID_CREDENTIALS") {
    return {
      status: "ERROR",
      code: "INVALID_CREDENTIALS",
      message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    };
  }

  if (result.status === "APPLICATION_ACCESS_DENIED") {
    return {
      status: "ERROR",
      code: "APPLICATION_ACCESS_DENIED",
      message: "บัญชีนี้ยังไม่สามารถเข้าใช้งาน DEMI ได้ กรุณาติดต่อผู้ดูแลระบบ",
    };
  }

  revalidatePath("/", "layout");
  redirect("/app");
}

export async function logoutAction(
  _previousState: LogoutActionState,
  _formData: FormData,
): Promise<LogoutActionState> {
  void _previousState;
  void _formData;

  try {
    await signOutCurrentSession();
  } catch {
    return {
      status: "ERROR",
      message: "ไม่สามารถออกจากระบบได้ กรุณาลองใหม่อีกครั้ง",
    };
  }

  revalidatePath("/", "layout");
  redirect("/login");
}

export async function getActorContextAction(): Promise<ActorContext | null> {
  return resolveCurrentActorContext();
}
