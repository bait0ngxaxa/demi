"use client";

import { useActionState } from "react";

import {
  initialLoginActionState,
  type LoginActionState,
} from "@/modules/auth/transport/action-state";
import { loginAction } from "@/modules/auth/transport/server-actions";

type LoginFormProps = {
  applicationAccessDenied: boolean;
};

export function LoginForm({ applicationAccessDenied }: LoginFormProps) {
  const [state, formAction, pending] = useActionState<LoginActionState, FormData>(
    loginAction,
    initialLoginActionState,
  );
  const errorMessage = state.status === "ERROR" ? state.message : undefined;

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {applicationAccessDenied ? (
        <div
          className="rounded-[14px] bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
          role="status"
        >
          บัญชีที่ยืนยันตัวตนอยู่ยังไม่สามารถเข้าใช้งาน DEMI ได้
          กรุณาใช้บัญชีที่ได้รับการเปิดใช้งาน หรือติดต่อผู้ดูแลระบบ
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="email">
          อีเมล
        </label>
        <input
          aria-describedby={errorMessage ? "login-error" : undefined}
          autoComplete="username"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="email"
          inputMode="email"
          maxLength={254}
          name="email"
          placeholder="name@example.com"
          required
          type="email"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="password">
          รหัสผ่าน
        </label>
        <input
          aria-describedby={errorMessage ? "login-error" : undefined}
          autoComplete="current-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="password"
          maxLength={128}
          name="password"
          required
          type="password"
        />
      </div>

      <div aria-live="polite" className="min-h-6">
        {errorMessage ? (
          <p className="text-sm leading-6 text-danger" id="login-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      <button
        className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-5 text-base font-semibold text-white shadow-[0_8px_22px_rgba(18,103,89,0.22)] transition-[background-color,box-shadow,transform] hover:bg-brand-strong hover:shadow-[0_10px_26px_rgba(18,103,89,0.28)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
        disabled={pending}
        type="submit"
      >
        {pending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
