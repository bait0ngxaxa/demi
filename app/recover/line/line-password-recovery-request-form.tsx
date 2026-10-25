"use client";

import { useState } from "react";

import { LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE } from "@/modules/line/domain/line-password-recovery-copy";

export function LinePasswordRecoveryRequestForm(): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData): Promise<void> {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      await fetch("/api/account-recovery/line/request", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nationalId: formData.get("nationalId") }),
      });
    } catch {
      // The public response intentionally does not reveal account or delivery state.
    } finally {
      setMessage(LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE);
      setPending(false);
    }
  }

  return (
    <form action={submit} className="mt-5 space-y-4" aria-busy={pending}>
      <label className="grid gap-1 text-sm font-medium text-text" htmlFor="line-recovery-national-id">
        เลขบัตรประชาชน
        <input
          autoComplete="off"
          className="min-h-12 rounded-control border border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-focus-ring"
          id="line-recovery-national-id"
          inputMode="numeric"
          maxLength={13}
          minLength={13}
          name="nationalId"
          pattern="[0-9]{13}"
          required
        />
      </label>
      <p className="text-sm leading-6 text-text-muted">กรอกเลขบัตรประชาชนของเจ้าของบัญชี ระบบจะไม่แจ้งว่าพบหรือไม่พบบัญชี</p>
      <button
        className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
        disabled={pending}
        type="submit"
      >
        {pending ? "กำลังส่งคำขอ…" : "ขอลิงก์ตั้งรหัสผ่านใหม่"}
      </button>
      {message ? <p className="text-sm leading-6 text-text" role="status" aria-live="polite">{message}</p> : null}
    </form>
  );
}
