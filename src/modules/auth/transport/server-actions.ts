"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  loginReturnToSchema,
  loginInputSchema,
} from "../schemas/login-schema";
import {
  authenticateWithPassword,
  signOutCurrentSession,
} from "../services/authentication-service";
import { resolveCurrentActorContext } from "../services/actor-context-service";
import type { ActorContext } from "../types/actor-context";
import type { LoginActionState, LogoutActionState } from "./action-state";
import { buildLoginReturnHref } from "./login-return";
import { trustedClientIpAddress } from "@/shared/http/trusted-client-ip";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginInputSchema.safeParse({
    nationalId: formData.get("nationalId"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบเลขบัตรประชาชนหรือรหัสผู้ดูแลระบบและรหัสผ่าน",
    };
  }

  let result: Awaited<ReturnType<typeof authenticateWithPassword>>;

  try {
    result = await authenticateWithPassword(parsed.data, {
      clientIpAddress: trustedClientIpAddress(await headers()),
    });
  } catch {
    return {
      status: "ERROR",
      code: "AUTH_INFRASTRUCTURE_FAILURE",
      message: "ขณะนี้เข้าสู่ระบบไม่ได้ กรุณาลองอีกครั้ง",
    };
  }

  if (result.status !== "AUTHORIZED") {
    return {
      status: "ERROR",
      code: "INVALID_CREDENTIALS",
      message: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง",
    };
  }

  revalidatePath("/", "layout");
  const requestedReturnTo = loginReturnToSchema.safeParse(
    formData.get("returnTo"),
  );
  redirect(requestedReturnTo.success ? requestedReturnTo.data : "/app");
}

async function signOutAndRedirect(destination: string): Promise<LogoutActionState> {
  try {
    await signOutCurrentSession();
  } catch {
    return {
      status: "ERROR",
      message: "ไม่สามารถออกจากระบบได้ กรุณาลองใหม่อีกครั้ง",
    };
  }

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function logoutAction(
  _previousState: LogoutActionState,
  _formData: FormData,
): Promise<LogoutActionState> {
  void _previousState;
  void _formData;
  return signOutAndRedirect("/login");
}

/**
 * Ends only the DEMI session (never the LINE binding) and returns to the LINE
 * account screen after login, so a different DEMI account can be used inside
 * the LINE app, whose webview otherwise keeps the previous session.
 */
export async function switchDemiAccountForLineAction(
  _previousState: LogoutActionState,
  _formData: FormData,
): Promise<LogoutActionState> {
  void _previousState;
  void _formData;
  return signOutAndRedirect(buildLoginReturnHref("/line/account"));
}

export async function getActorContextAction(): Promise<ActorContext | null> {
  return resolveCurrentActorContext();
}
