"use client";

import { useActionState } from "react";

import { changeAuthenticatedPasswordAction } from "@/modules/account-security/transport/server-actions";
import {
  initialPasswordChangeActionState,
  type PasswordChangeActionState,
} from "@/modules/account-security/transport/action-state";

export function PasswordChangeForm(): React.JSX.Element {
  const [state, formAction, pending] = useActionState<PasswordChangeActionState, FormData>(
    changeAuthenticatedPasswordAction,
    initialPasswordChangeActionState,
  );

  return (
    <form action={formAction} className="mt-6 grid min-w-0 gap-5">
      <div className="min-w-0">
        <label className="block text-sm font-semibold text-text" htmlFor="currentPassword">
          รหัสผ่านปัจจุบัน
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          id="currentPassword"
          maxLength={128}
          name="currentPassword"
          required
          type="password"
        />
      </div>
      <div className="min-w-0">
        <label className="block text-sm font-semibold text-text" htmlFor="newPassword">
          รหัสผ่านใหม่
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          id="newPassword"
          maxLength={128}
          minLength={12}
          name="newPassword"
          required
          type="password"
        />
        <p className="mt-1 text-xs leading-5 text-text-muted">ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร</p>
      </div>
      <div className="min-w-0">
        <label className="block text-sm font-semibold text-text" htmlFor="passwordConfirmation">
          ยืนยันรหัสผ่านใหม่
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          id="passwordConfirmation"
          maxLength={128}
          minLength={12}
          name="passwordConfirmation"
          required
          type="password"
        />
      </div>

      {state.message ? (
        <p
          aria-live="polite"
          className={`break-words rounded-control border px-4 py-3 text-sm leading-6 ${
            state.status === "SUCCESS"
              ? "border-success/20 bg-success-soft text-success"
              : "border-danger/20 bg-danger-soft text-danger"
          }`}
          role={state.status === "ERROR" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-action-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-fit"
        disabled={pending}
        type="submit"
      >
        {pending ? "กำลังเปลี่ยนรหัสผ่าน…" : "เปลี่ยนรหัสผ่าน"}
      </button>
    </form>
  );
}
