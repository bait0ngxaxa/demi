"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { changeAuthenticatedPasswordAction } from "@/modules/account-security/transport/server-actions";
import {
  initialPasswordChangeActionState,
  type PasswordChangeActionState,
} from "@/modules/account-security/transport/action-state";
import { PasswordInput } from "@/components/ui/password-input";

export function PasswordChangeForm(): React.JSX.Element {
  const [state, formAction, pending, unknownOutcome] = useMutationActionState<PasswordChangeActionState, FormData>(
    changeAuthenticatedPasswordAction,
    initialPasswordChangeActionState,
  );

  return (
    <form action={formAction} className="mt-6 grid min-w-0 gap-5">
      <div className="min-w-0">
        <label className="block text-sm font-semibold text-text" htmlFor="currentPassword">
          รหัสผ่านปัจจุบัน
        </label>
        <PasswordInput
          autoComplete="current-password"
          containerClassName="mt-2"
          className="block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          id="currentPassword"
          maxLength={128}
          name="currentPassword"
          required
          aria-invalid={Boolean(state.fieldErrors?.currentPassword)}
          aria-describedby={state.fieldErrors?.currentPassword ? "currentPassword-error" : undefined}
        />
        {state.fieldErrors?.currentPassword ? <p className="mt-1 text-sm leading-5 text-danger" id="currentPassword-error" role="alert">{state.fieldErrors.currentPassword}</p> : null}
      </div>
      <div className="min-w-0">
        <label className="block text-sm font-semibold text-text" htmlFor="newPassword">
          รหัสผ่านใหม่
        </label>
        <PasswordInput
          autoComplete="new-password"
          containerClassName="mt-2"
          className="block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          id="newPassword"
          maxLength={128}
          minLength={12}
          name="newPassword"
          required
        />
        <p className="mt-1 text-xs leading-5 text-text-muted">ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร</p>
      </div>
      <div className="min-w-0">
        <label className="block text-sm font-semibold text-text" htmlFor="passwordConfirmation">
          ยืนยันรหัสผ่านใหม่
        </label>
        <PasswordInput
          autoComplete="new-password"
          containerClassName="mt-2"
          className="block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          id="passwordConfirmation"
          maxLength={128}
          minLength={12}
          name="passwordConfirmation"
          required
        />
      </div>

      {state.status === "OUTCOME_UNCERTAIN" ? (
        <Alert role="alert" variant="warning">
          <p>{state.message}</p>
        </Alert>
      ) : state.message ? (
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

      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "note", note: "ออกจากระบบแล้วเข้าสู่ระบบด้วยรหัสผ่านใหม่เพื่อตรวจสอบ หากเข้าไม่ได้ให้ใช้รหัสผ่านเดิม" }} />

      <Button className="w-full sm:w-fit" disabled={unknownOutcome || state.status === "OUTCOME_UNCERTAIN"} loading={pending} type="submit">
        {pending ? "กำลังเปลี่ยนรหัสผ่าน…" : "เปลี่ยนรหัสผ่าน"}
      </Button>
    </form>
  );
}
