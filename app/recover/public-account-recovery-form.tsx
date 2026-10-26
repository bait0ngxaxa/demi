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
type ConfirmationKind = "THAI_NATIONAL_ID" | "PLATFORM_ADMIN_IDENTIFIER";

export function PublicAccountRecoveryForm({ lineRecoveryAvailable }: { lineRecoveryAvailable: boolean }): React.JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [availability, setAvailability] = useState<{
    token: string;
    status: Availability;
    confirmationKind?: ConfirmationKind;
    expiresAt?: string;
    mode?: "IN_PERSON" | "ONLINE";
  } | null>(null);
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
      if (cancelled) return;
      setAvailability(result.status === "READY"
        ? { token, status: "READY", confirmationKind: result.confirmationKind, expiresAt: result.expiresAt, mode: result.mode }
        : { token, status: "INVALID" });
    }, () => {
      if (!cancelled) setAvailability({ token, status: "INVALID" });
    });
    return () => { cancelled = true; };
  }, [token]);

  const currentAvailability = token && availability?.token === token ? availability.status : "CHECKING";
  const currentReset = token && availability?.token === token && availability.status === "READY" ? availability : null;
  const isPlatformAdminReset = currentReset?.confirmationKind === "PLATFORM_ADMIN_IDENTIFIER";
  const passwordError = completion.status === "ERROR" ? completion.fieldErrors?.newPassword : undefined;

  if (!token) {
    return (
      <Panel>
        <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-text">กู้คืนรหัสผ่าน</h1>
        <section aria-labelledby="recover-line-heading" className="mt-5 border-b border-border pb-5">
          <h2 className="text-lg font-semibold text-text" id="recover-line-heading">
            {lineRecoveryAvailable ? "ลืมรหัสผ่าน · รับลิงก์ทาง LINE" : "กู้คืนรหัสผ่านผ่าน LINE"}
          </h2>
          {lineRecoveryAvailable ? (
            <>
              <p className="mt-2 text-sm leading-6 text-text-muted">ขอรับลิงก์สำหรับตั้งรหัสผ่านใหม่ผ่านบัญชี LINE ที่เชื่อมกับ DEMI</p>
              <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/recover/line">เริ่มขอรับลิงก์ทาง LINE</Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-text-muted" role="status">ผู้ที่ผูก LINE และผ่านเงื่อนไขสามารถขอรับลิงก์ตั้งรหัสผ่านใหม่ทาง LINE ได้ ขณะนี้ช่องทางนี้ยังไม่พร้อม กรุณาติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตน</p>
              <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="#recover-hospital">ดูวิธีติดต่อโรงพยาบาล</Link>
            </>
          )}
        </section>
        <section aria-labelledby="recover-hospital-heading" className="mt-5" id="recover-hospital">
          <h2 className="text-lg font-semibold text-text" id="recover-hospital-heading">ติดต่อโรงพยาบาลเพื่อยืนยันตัวตน</h2>
          <p className="mt-2 break-words text-sm leading-6 text-text-muted">
            หากไม่ได้ผูก LINE หรือใช้ช่องทางนี้ไม่ได้ กรุณาติดต่อโรงพยาบาลที่ดูแลเพื่อขอความช่วยเหลือและยืนยันตัวตน หากเป็นเจ้าของโรงพยาบาลเพียงคนเดียวและไม่มี OWNER คนอื่นช่วยได้ ให้ติดต่อผู้ดูแลระบบ DEMI
          </p>
          <p className="mt-3 break-words text-sm leading-6 text-text-muted">ผู้ดูแลระบบ DEMI ต้องให้ ADMIN อีกคนช่วยกู้คืนบัญชี หากทำไม่ได้ให้ติดต่อผู้ปฏิบัติงานระบบตามช่องทางสนับสนุนที่กำหนด</p>
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
        <p className="mt-3 text-sm leading-6 text-text-muted">เข้าสู่ระบบด้วย{isPlatformAdminReset ? "ตัวระบุบัญชี ADMIN ที่ลงทะเบียนไว้" : "เลขบัตรประชาชน"}และรหัสผ่านใหม่</p>
        <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/login">ไปหน้าเข้าสู่ระบบ</Link>
      </Panel>
    );
  }

  return (
    <Panel>
      <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-text">ตั้งรหัสผ่านใหม่</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">
        {isPlatformAdminReset
          ? "ADMIN อีกคนได้ตรวจสอบตัวตนของคุณและส่งลิงก์นี้ให้โดยตรง ตัวระบุด้านล่างใช้ยืนยันว่าลิงก์ตรงกับบัญชีที่เลือก ไม่ใช้แทนการตรวจสอบตัวตน ลิงก์ใช้ได้ครั้งเดียว"
          : "กรอกเลขบัตรประชาชนของเจ้าของบัญชีเพื่อยืนยันตัวตน ลิงก์ใช้ได้ครั้งเดียว"}
      </p>
      {currentReset?.expiresAt ? (
        <p className="mt-2 text-sm text-text-muted" role="status">
          {currentReset.mode === "IN_PERSON" ? "ลิงก์สำหรับส่งต่อหน้าใช้ได้ 15 นาที" : "ลิงก์ออนไลน์ใช้ได้ 24 ชั่วโมง"} หมดอายุ {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(currentReset.expiresAt))}
        </p>
      ) : null}
      <form action={formAction} className="mt-5 space-y-4">
        <input name="token" type="hidden" value={token} />
        {isPlatformAdminReset ? (
          <label className="grid gap-1 text-sm font-medium">
            ตัวระบุเข้าสู่ระบบ ADMIN ที่ลงทะเบียนไว้
            <input autoComplete="username" className="min-h-11 rounded-md border border-border bg-surface px-3" maxLength={32} name="platformAdminIdentifier" required />
          </label>
        ) : (
          <label className="grid gap-1 text-sm font-medium">
            เลขบัตรประชาชนของเจ้าของบัญชี
            <input autoComplete="off" className="min-h-11 rounded-md border border-border bg-surface px-3" inputMode="numeric" maxLength={13} minLength={13} name="nationalId" pattern="[0-9]{13}" required />
          </label>
        )}
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
