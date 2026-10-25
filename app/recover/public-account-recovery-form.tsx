"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Panel } from "@/components/ui/panel";
import { initialAccountRecoveryCompletionActionState } from "@/modules/account-security/transport/action-state";
import {
  checkMediatedPasswordResetAction,
  completeMediatedPasswordResetAction,
} from "@/modules/account-security/transport/server-actions";

type Availability = "READY" | "INVALID";

export function PublicAccountRecoveryForm({ lineRecoveryEnabled = false }: { lineRecoveryEnabled?: boolean }): React.JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [availability, setAvailability] = useState<{ token: string; status: Availability } | null>(null);
  const [completion, formAction, pending] = useActionState(
    completeMediatedPasswordResetAction,
    initialAccountRecoveryCompletionActionState,
  );

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const rawToken = hash.slice(1);
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    void Promise.resolve().then(() => {
      try {
        setToken(decodeURIComponent(rawToken) || null);
      } catch {
        setToken(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void checkMediatedPasswordResetAction(token).then((result) => {
      if (!cancelled) setAvailability({ token, status: result.status === "READY" ? "READY" : "INVALID" });
    }, () => {
      if (!cancelled) setAvailability({ token, status: "INVALID" });
    });
    return () => { cancelled = true; };
  }, [token]);

  const currentAvailability = token && availability?.token === token ? availability.status : "CHECKING";
  const passwordError = completion.status === "ERROR" ? completion.fieldErrors?.newPassword : undefined;

  if (!token) {
    return (
      <Panel>
        <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-text">กู้คืนรหัสผ่าน</h1>
        {lineRecoveryEnabled ? (
          <section aria-labelledby="recover-line-heading" className="mt-5 border-b border-border pb-5">
            <h2 className="text-lg font-semibold text-text" id="recover-line-heading">ลืมรหัสผ่าน · รับลิงก์ทาง LINE</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">ขอรับลิงก์สำหรับตั้งรหัสผ่านใหม่ผ่านบัญชี LINE ที่เชื่อมกับ DEMI</p>
            <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/recover/line">เริ่มขอรับลิงก์ทาง LINE</Link>
          </section>
        ) : null}
        <section aria-labelledby="recover-hospital-heading" className="mt-5">
          <h2 className="text-lg font-semibold text-text" id="recover-hospital-heading">ติดต่อโรงพยาบาลเพื่อยืนยันตัวตน</h2>
          <p className="mt-2 break-words text-sm leading-6 text-text-muted">
            หากเข้าใช้บัญชีไม่ได้ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณเพื่อขอรีเซ็ตรหัสผ่าน โดยยืนยันตัวตนต่อหน้า หรือผ่านวิดีโอคอล
          </p>
        </section>
        <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/login">ไปหน้าเข้าสู่ระบบ</Link>
      </Panel>
    );
  }

  if (currentAvailability === "CHECKING") {
    return <Panel><p className="text-sm text-text-muted" role="status">กำลังตรวจสอบลิงก์…</p></Panel>;
  }

  if (currentAvailability === "INVALID") {
    return (
      <Panel>
        <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-text">ลิงก์นี้ใช้ไม่ได้แล้ว</h1>
        <p className="mt-3 break-words text-sm leading-6 text-text-muted">ลิงก์อาจหมดอายุ ถูกยกเลิก หรือใช้ยืนยันตัวตนครบจำนวนครั้งแล้ว กรุณาติดต่อโรงพยาบาลที่ดูแลคุณเพื่อขอเริ่มขั้นตอนใหม่</p>
        <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/login">ไปหน้าเข้าสู่ระบบ</Link>
      </Panel>
    );
  }

  if (completion.status === "COMPLETED") {
    return (
      <Panel>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">เปลี่ยนรหัสผ่านแล้ว</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">เข้าสู่ระบบด้วยเลขบัตรประชาชนและรหัสผ่านใหม่</p>
        <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/login">ไปหน้าเข้าสู่ระบบ</Link>
      </Panel>
    );
  }

  return (
    <Panel>
      <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-text">ตั้งรหัสผ่านใหม่</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">กรอกเลขบัตรประชาชนของคุณเองเพื่อยืนยันตัวตน ลิงก์นี้ใช้ได้ครั้งเดียว</p>
      <form action={formAction} className="mt-5 space-y-4">
        <input name="token" type="hidden" value={token} />
        <label className="grid gap-1 text-sm font-medium">
          เลขบัตรประชาชนของเจ้าของบัญชี
          <input autoComplete="off" className="min-h-11 rounded-md border border-border bg-surface px-3" inputMode="numeric" maxLength={13} minLength={13} name="nationalId" pattern="[0-9]{13}" required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          รหัสผ่านใหม่
          <input
            aria-describedby={passwordError ? "recover-new-password-error" : undefined}
            aria-invalid={passwordError ? true : undefined}
            autoComplete="new-password"
            className="min-h-11 rounded-md border border-border bg-surface px-3"
            maxLength={128}
            minLength={12}
            name="newPassword"
            required
            type="password"
          />
          {passwordError ? <span className="text-sm font-normal text-danger" id="recover-new-password-error">{passwordError}</span> : null}
        </label>
        <label className="grid gap-1 text-sm font-medium">
          ยืนยันรหัสผ่านใหม่
          <input autoComplete="new-password" className="min-h-11 rounded-md border border-border bg-surface px-3" maxLength={128} minLength={12} name="passwordConfirmation" required type="password" />
        </label>
        {completion.status === "ERROR" ? <p className="text-sm text-danger" role="alert">{completion.message}</p> : null}
        <button className="min-h-11 rounded-md bg-brand px-5 font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "กำลังเปลี่ยนรหัสผ่าน…" : "ยืนยันและตั้งรหัสผ่าน"}
        </button>
      </form>
    </Panel>
  );
}
