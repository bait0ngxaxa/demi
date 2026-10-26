"use client";

import liff from "@line/liff";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { Panel } from "@/components/ui/panel";
import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { accountRecoveryTokenSchema } from "@/modules/account-security/schemas/account-security-schemas";
import { initializeLineAccountLiff } from "../line-recovery-panel";
import { PasswordInput } from "@/components/ui/password-input";

const openResponseSchema = z.object({ status: z.enum(["READY", "EXPIRED", "OTHER_LINE", "INELIGIBLE"]) });
const completeResponseSchema = z.object({
  status: z.enum(["COMPLETED", "ERROR"]),
  code: z.enum([
    "PASSWORD_POLICY_REJECTED",
    "PASSWORD_REJECTED",
    "LINK_UNAVAILABLE",
    "LINE_PROOF_INVALID",
    "RECONCILIATION_REQUIRED",
    "OUTCOME_UNCERTAIN",
  ]).optional(),
});
type RecoveryStatus = "LOADING" | "READY" | "EXPIRED" | "OTHER_LINE" | "INELIGIBLE" | "LINE_UNAVAILABLE" | "UNCERTAIN" | "COMPLETED";
type RecoveryLocator = { token: string } | { capabilityId: string };

function captureRecoveryLocatorAfterInit(): RecoveryLocator | null {
  const url = new URL(window.location.href);
  const queryParts = window.location.search.slice(1).split("&").filter(Boolean);
  const capabilityParts = queryParts.filter((part) => part.split("=", 1)[0] === "capability");
  const capabilityId = capabilityParts.length === 1 ? capabilityParts[0]?.slice("capability=".length) ?? null : null;
  const rawToken = url.hash.slice(1);
  let token: string | null = null;
  try { token = rawToken ? decodeURIComponent(rawToken) : null; } catch { token = null; }

  let locator: RecoveryLocator | null = null;
  if (capabilityParts.length === 1 && capabilityId && !rawToken && z.uuid().safeParse(capabilityId).success) {
    locator = { capabilityId };
  } else if (capabilityParts.length === 0 && accountRecoveryTokenSchema.safeParse(token).success && token) {
    locator = { token };
  }

  const remainingQuery = queryParts.filter((part) => part.split("=", 1)[0] !== "capability").join("&");
  const cleanedUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}`;
  window.history.replaceState(window.history.state, document.title, cleanedUrl);
  return locator;
}

export function LinePasswordRecoveryClient({ liffId }: { liffId: string | null }): React.JSX.Element {
  const [locator, setLocator] = useState<RecoveryLocator | null>(null);
  const [status, setStatus] = useState<RecoveryStatus>("LOADING");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const running = useRef(false);
  const mountGeneration = useRef(0);

  useEffect(() => {
    const generation = mountGeneration.current + 1;
    mountGeneration.current = generation;
    let active = true;

    async function verify(): Promise<void> {
      if (!liffId) {
        setStatus("EXPIRED");
        return;
      }
      try {
        await initializeLineAccountLiff(liffId);
        if (!active) return;
        const recoveredLocator = captureRecoveryLocatorAfterInit();
        setLocator(recoveredLocator);
        if (!recoveredLocator) {
          setStatus("EXPIRED");
          return;
        }
        if (!liff.isLoggedIn()) {
          setStatus("LINE_UNAVAILABLE");
          return;
        }
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error();
        const response = await fetch("/api/account-recovery/line/open", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...recoveredLocator, idToken }),
          signal: AbortSignal.timeout(25_000),
        });
        const result = openResponseSchema.safeParse(await response.json());
        if (!active) return;
        setStatus(response.ok && result.success ? result.data.status : "EXPIRED");
      } catch {
        if (active) setStatus("EXPIRED");
      }
    }
    void verify();
    return () => {
      active = false;
      if (mountGeneration.current === generation) mountGeneration.current += 1;
    };
  }, [liffId]);

  async function complete(formData: FormData): Promise<void> {
    if (!locator || status !== "READY" || running.current || !liffId) return;
    const newPassword = formData.get("newPassword");
    const passwordConfirmation = formData.get("passwordConfirmation");
    const passwordCheck = userOwnedPasswordSchema.safeParse(newPassword);
    setNewPasswordError(passwordCheck.success ? "" : "รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษรและผ่านนโยบายความปลอดภัย");
    setMessage("");
    if (!passwordCheck.success || typeof passwordConfirmation !== "string" || passwordConfirmation !== newPassword) {
      if (typeof passwordConfirmation !== "string" || passwordConfirmation !== newPassword) setMessage("รหัสผ่านใหม่และการยืนยันต้องตรงกัน");
      return;
    }
    running.current = true;
    setBusy(true);
    const generation = mountGeneration.current;
    let completionRequestStarted = false;
    try {
      if (!liff.isLoggedIn()) {
        if (mountGeneration.current === generation) setStatus("LINE_UNAVAILABLE");
        return;
      }
      const idToken = liff.getIDToken();
      if (!idToken) {
        if (mountGeneration.current === generation) setStatus("LINE_UNAVAILABLE");
        return;
      }
      completionRequestStarted = true;
      const response = await fetch("/api/account-recovery/line/complete", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...locator,
          idToken,
          newPassword,
          passwordConfirmation,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const result = completeResponseSchema.safeParse(await response.json());
      if (response.ok && result.success && result.data.status === "COMPLETED") {
        if (mountGeneration.current === generation) setStatus("COMPLETED");
      } else if (result.success && result.data.status === "ERROR") {
        const code = result.data.code ?? "OUTCOME_UNCERTAIN";
        if (mountGeneration.current !== generation) return;
        if (code === "PASSWORD_POLICY_REJECTED") {
          setNewPasswordError("รหัสผ่านนี้ยังไม่ผ่านข้อกำหนดด้านความปลอดภัย กรุณาเลือกรหัสผ่านใหม่");
        } else if (code === "PASSWORD_REJECTED") {
          setNewPasswordError("ระบบไม่ยอมรับรหัสผ่านนี้ กรุณาเลือกรหัสผ่านใหม่แล้วลองอีกครั้ง");
        } else if (code === "LINK_UNAVAILABLE") {
          setStatus("EXPIRED");
        } else if (code === "LINE_PROOF_INVALID") {
          setStatus("OTHER_LINE");
        } else {
          setStatus("UNCERTAIN");
        }
      } else if (mountGeneration.current === generation) {
        setStatus("UNCERTAIN");
      }
    } catch {
      if (mountGeneration.current === generation) {
        if (completionRequestStarted) {
          setStatus("UNCERTAIN");
        } else {
          setMessage("ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาเปิดลิงก์จาก LINE ที่ผูกกับบัญชีแล้วลองอีกครั้ง");
        }
      }
    } finally {
      running.current = false;
      if (mountGeneration.current === generation) setBusy(false);
    }
  }

  if (status === "LOADING") {
    return <RecoveryShell><p className="text-sm text-text-muted" role="status" aria-live="polite">กำลังยืนยันบัญชี LINE…</p></RecoveryShell>;
  }
  if (status === "LINE_UNAVAILABLE") {
    return <RecoveryShell>
      <h1 className="text-2xl font-semibold text-text">เปิดลิงก์ใน LINE</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">ลิงก์นี้ต้องยืนยันด้วยบัญชี LINE ที่ผูกกับ DEMI กรุณาเปิดจาก LINE ที่ได้รับข้อความ</p>
      {liffId && locator ? <a className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href={
        "token" in locator
          ? `https://liff.line.me/${liffId}/recover#${encodeURIComponent(locator.token)}`
          : `https://liff.line.me/${liffId}/recover?capability=${encodeURIComponent(locator.capabilityId)}`
      }>เปิดลิงก์ใน LINE</a> : null}
    </RecoveryShell>;
  }
  if (status === "EXPIRED") {
    return <RecoveryShell>
      <h1 className="text-2xl font-semibold text-text">ลิงก์นี้ใช้ไม่ได้แล้ว</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">ลิงก์อาจหมดอายุ ถูกยกเลิก หรือใช้ไปแล้ว กรุณาเริ่มขอลิงก์ใหม่หรือติดต่อโรงพยาบาล</p>
      <RecoveryLinks />
    </RecoveryShell>;
  }
  if (status === "OTHER_LINE") {
    return <RecoveryShell>
      <h1 className="text-2xl font-semibold text-text">บัญชี LINE นี้ใช้ยืนยันลิงก์ไม่ได้</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">กรุณาเปิดลิงก์จาก LINE ที่ได้รับข้อความตั้งรหัสผ่านใหม่</p>
      <RecoveryLinks />
    </RecoveryShell>;
  }
  if (status === "INELIGIBLE") {
    return <RecoveryShell>
      <h1 className="text-2xl font-semibold text-text">ใช้การตั้งรหัสผ่านทาง LINE ไม่ได้</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">กรุณาติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตนและขอรีเซ็ตรหัสผ่าน</p>
      <RecoveryLinks />
    </RecoveryShell>;
  }
  if (status === "COMPLETED") {
    return <RecoveryShell>
      <h1 className="text-2xl font-semibold text-text">ตั้งรหัสผ่านใหม่แล้ว</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">เข้าสู่ระบบ DEMI ด้วยเลขบัตรประชาชนและรหัสผ่านใหม่ได้</p>
      <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/login">ไปหน้าเข้าสู่ระบบ</Link>
    </RecoveryShell>;
  }
  if (status === "UNCERTAIN") {
    return <RecoveryShell>
      <h1 className="text-2xl font-semibold text-text">ยังยืนยันผลการตั้งรหัสผ่านไม่ได้</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">กรุณาอย่าลองใช้ลิงก์นี้ซ้ำ ติดต่อโรงพยาบาลเพื่อให้ตรวจสอบสถานะบัญชี</p>
      <RecoveryLinks />
    </RecoveryShell>;
  }
  return <RecoveryShell>
    <h1 className="text-2xl font-semibold text-text">ตั้งรหัสผ่านใหม่</h1>
    <p className="mt-3 text-sm leading-6 text-text-muted">ระบบยืนยันบัญชี LINE ที่ผูกกับบัญชี DEMI แล้ว กรุณาตั้งรหัสผ่านใหม่ของคุณ</p>
    <form action={complete} className="mt-5 space-y-4" aria-busy={busy}>
      <label className="grid gap-1 text-sm font-medium text-text" htmlFor="line-recovery-new-password">
        รหัสผ่านใหม่
        <PasswordInput
          autoComplete="new-password"
          aria-describedby={newPasswordError ? "line-recovery-password-error" : undefined}
          aria-invalid={newPasswordError ? true : undefined}
          className="min-h-12 rounded-control border border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-focus-ring"
          id="line-recovery-new-password"
          maxLength={128}
          minLength={12}
          name="newPassword"
          required
        />
        {newPasswordError ? <span id="line-recovery-password-error" className="text-sm font-normal text-danger">{newPasswordError}</span> : null}
      </label>
      <label className="grid gap-1 text-sm font-medium text-text" htmlFor="line-recovery-password-confirmation">
        ยืนยันรหัสผ่านใหม่
        <PasswordInput autoComplete="new-password" className="min-h-12 rounded-control border border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-focus-ring" id="line-recovery-password-confirmation" maxLength={128} minLength={12} name="passwordConfirmation" required />
      </label>
      {message ? <p className="text-sm text-danger" role="alert">{message}</p> : null}
      <button className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring" disabled={busy} type="submit">
        {busy ? "กำลังตั้งรหัสผ่าน…" : "ยืนยันและตั้งรหัสผ่าน"}
      </button>
    </form>
  </RecoveryShell>;
}

function RecoveryShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12"><Panel>{children}</Panel></main>;
}

function RecoveryLinks(): React.JSX.Element {
  return <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
    <Link className="inline-flex min-h-11 items-center text-brand-strong underline underline-offset-4" href="/recover">ดูวิธีกู้คืนบัญชี</Link>
    <Link className="inline-flex min-h-11 items-center text-brand-strong underline underline-offset-4" href="/login">ไปหน้าเข้าสู่ระบบ</Link>
  </div>;
}
