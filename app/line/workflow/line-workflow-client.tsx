"use client";

import liff from "@line/liff";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { LINE_WORKFLOW_GATEWAY_PATH } from "@/modules/line/domain/line-navigation-intents";

import {
  consumeLineWorkflowLoginAttempt,
  initializeLineWorkflowLiff,
  markLineWorkflowLoginAttempt,
  verifyLineWorkflow,
  type LineWorkflowGatewayState,
} from "./line-workflow-gateway";

/** Server-decided before any SDK work; none of these states initialize LIFF. */
export type LineWorkflowShellStatus = "READY" | "UNAVAILABLE" | "NAVIGATION_INVALID" | "PLATFORM_STATE_INVALID";
export type LineWorkflowScreenState = LineWorkflowGatewayState | Exclude<LineWorkflowShellStatus, "READY">;

const primaryButtonClass = "inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 text-center font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring";
const secondaryButtonClass = "inline-flex min-h-12 w-full items-center justify-center rounded-control border border-line-strong bg-surface px-5 py-3 text-center font-semibold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring";

type Copy = { title: string; body: string; busy?: boolean };

const copy: Record<LineWorkflowScreenState, Copy> = {
  INITIALIZING: { title: "กำลังเปิดนัดหมายผ่าน LINE", body: "กรุณารอสักครู่", busy: true },
  VERIFYING: { title: "กำลังตรวจสอบบัญชี", body: "ระบบกำลังตรวจสอบบัญชี LINE และบัญชี DEMI ของคุณ", busy: true },
  UNAVAILABLE: { title: "ยังเปิดนัดหมายผ่าน LINE ไม่ได้", body: "บริการนี้ยังไม่พร้อมใช้งาน คุณยังใช้ DEMI บนเว็บได้ตามปกติ" },
  NAVIGATION_INVALID: { title: "ลิงก์นี้ไม่ถูกต้อง", body: "กรุณาเปิดจากเมนู DEMI ใน LINE อีกครั้ง" },
  PLATFORM_STATE_INVALID: { title: "ลิงก์นี้ไม่ถูกต้อง", body: "กรุณาปิดหน้านี้แล้วเปิดจากเมนู DEMI ใน LINE อีกครั้ง" },
  INIT_FAILED: { title: "เปิดผ่าน LINE ไม่สำเร็จ", body: "กรุณาลองใหม่ หากยังไม่สำเร็จให้ปิดแล้วเปิดจากเมนู DEMI ใน LINE" },
  LINE_LOGIN_REQUIRED: { title: "เข้าสู่ระบบ LINE ก่อน", body: "หน้านี้เปิดนอกแอป LINE กรุณาเข้าสู่ระบบ LINE เพื่อยืนยันบัญชีของคุณ" },
  LINE_PROOF_UNAVAILABLE: { title: "ยืนยันบัญชี LINE ไม่สำเร็จ", body: "การยืนยันอาจหมดอายุ กรุณาลองใหม่ หรือปิดแล้วเปิดจากเมนู DEMI ใน LINE" },
  LOGIN_REQUIRED: { title: "เข้าสู่ระบบ DEMI", body: "ใช้บัญชี DEMI เดียวกับที่เชื่อมกับ LINE นี้ จากนั้นระบบจะตรวจสอบอีกครั้ง" },
  ACCOUNT_MISMATCH: { title: "บัญชีไม่ตรงกัน", body: "บัญชี LINE นี้ไม่ตรงกับบัญชี DEMI ที่ลงชื่อเข้าใช้อยู่ กรุณาออกจากระบบ DEMI แล้วเข้าสู่ระบบด้วยบัญชีที่ถูกต้อง หรือตรวจสอบที่หน้าบัญชี LINE" },
  LINE_NOT_LINKED: { title: "ยังไม่ได้เชื่อมบัญชี LINE", body: "เชื่อมบัญชี LINE กับ DEMI ที่หน้าบัญชี LINE ก่อน แล้วเปิดจากเมนูอีกครั้ง" },
  WORKFLOW_INELIGIBLE: { title: "ยังใช้งานนัดหมายผ่าน LINE ไม่ได้", body: "บัญชีนี้ยังไม่พร้อมสำหรับนัดหมายผู้ป่วยผ่าน LINE หากคิดว่าไม่ถูกต้อง กรุณาติดต่อโรงพยาบาล" },
  NOT_ACTIVATED: { title: "ยังไม่เปิดให้บริการ", body: "นัดหมายผ่าน LINE MINI App ยังไม่เปิดใช้งาน ดูนัดหมายได้ที่ DEMI บนเว็บ" },
  RATE_LIMITED: { title: "ลองหลายครั้งเกินไป", body: "กรุณารอสักครู่แล้วลองใหม่" },
  TEMPORARILY_UNAVAILABLE: { title: "ระบบไม่พร้อมใช้งานชั่วคราว", body: "กรุณาลองใหม่ภายหลัง" },
};

const retryStates = new Set<LineWorkflowScreenState>(["INIT_FAILED", "LINE_PROOF_UNAVAILABLE", "RATE_LIMITED", "TEMPORARILY_UNAVAILABLE"]);
const webExitStates = new Set<LineWorkflowScreenState>(["UNAVAILABLE", "NOT_ACTIVATED", "WORKFLOW_INELIGIBLE", "NAVIGATION_INVALID", "PLATFORM_STATE_INVALID"]);

export function LineWorkflowScreen({
  state,
  loginHref,
  repeatedLogin = false,
  externalBrowser = false,
  onRetry,
  onLineLogin,
  onDemiLogin,
}: {
  state: LineWorkflowScreenState;
  loginHref: string;
  repeatedLogin?: boolean;
  externalBrowser?: boolean;
  onRetry?: () => void;
  onLineLogin?: () => void;
  onDemiLogin?: () => void;
}): React.JSX.Element {
  const current = copy[state];
  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <p className="text-sm font-semibold text-brand">DEMI</p>
          <h1 className="mt-5 text-3xl">นัดหมายของฉัน</h1>
        </header>
        <section aria-labelledby="line-workflow-status" aria-busy={current.busy ? true : undefined} className="rounded-panel border border-line bg-surface p-5 shadow-surface sm:p-7">
          <div className="space-y-4" role="status" aria-live="polite">
            <h2 id="line-workflow-status" className="text-2xl font-semibold">{current.title}</h2>
            <p className="type-readable text-base text-muted">{current.body}</p>
            {state === "LOGIN_REQUIRED" && repeatedLogin ? (
              <p className="rounded-control bg-warning-soft px-4 py-3 text-sm text-warning">
                หากเข้าสู่ระบบแล้วยังกลับมาที่หน้านี้ เบราว์เซอร์นี้อาจไม่เก็บการเข้าสู่ระบบไว้ กรุณาเข้าสู่ระบบในเบราว์เซอร์เดียวกับที่เปิดหน้านี้ แล้วลองใหม่
              </p>
            ) : null}
            {externalBrowser && !current.busy ? (
              <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">
                คุณกำลังเปิดนอกแอป LINE บางความสามารถของ LINE อาจใช้ไม่ได้ และต้องเข้าสู่ระบบ DEMI ในเบราว์เซอร์นี้
              </p>
            ) : null}
          </div>
          <div className="mt-6 space-y-3">
            {state === "LINE_LOGIN_REQUIRED" ? (
              <button type="button" onClick={onLineLogin} className={primaryButtonClass}>เข้าสู่ระบบด้วย LINE</button>
            ) : null}
            {state === "LOGIN_REQUIRED" ? (
              <a href={loginHref} onClick={onDemiLogin} className={primaryButtonClass}>เข้าสู่ระบบ DEMI</a>
            ) : null}
            {retryStates.has(state) || (state === "LOGIN_REQUIRED" && repeatedLogin) ? (
              <button type="button" onClick={onRetry} className={state === "LOGIN_REQUIRED" ? secondaryButtonClass : primaryButtonClass}>ลองอีกครั้ง</button>
            ) : null}
            {state === "ACCOUNT_MISMATCH" || state === "LINE_NOT_LINKED" ? (
              <Link href="/line/account" className={primaryButtonClass}>ไปที่บัญชี LINE</Link>
            ) : null}
            {webExitStates.has(state) || state === "ACCOUNT_MISMATCH" ? (
              <Link href="/app" className={secondaryButtonClass}>ไปที่ DEMI บนเว็บ</Link>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function LineWorkflowClient({
  status,
  liffId,
  loginHref,
  lineLoginRedirectUri,
}: {
  status: LineWorkflowShellStatus;
  liffId: string | null;
  loginHref: string;
  lineLoginRedirectUri: string;
}): React.JSX.Element {
  const [state, setState] = useState<LineWorkflowScreenState>(
    status === "READY" && liffId ? "INITIALIZING" : status === "READY" ? "UNAVAILABLE" : status,
  );
  const [repeatedLogin, setRepeatedLogin] = useState(false);
  const [externalBrowser, setExternalBrowser] = useState(false);
  const running = useRef(false);

  const verify = useCallback(async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setState("VERIFYING");
    try {
      const next = await verifyLineWorkflow(liff);
      const store = sessionStore();
      const attempted = store ? consumeLineWorkflowLoginAttempt(store) : false;
      setRepeatedLogin(next === "LOGIN_REQUIRED" && attempted);
      setState(next);
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (status !== "READY" || !liffId) return;
    let active = true;
    void initializeLineWorkflowLiff(liff, liffId).then(async (result) => {
      if (!active) return;
      if (result !== "INIT_FAILED") {
        // SDK parameters (primary redirect credentials, login code/state) are consumed; remove them.
        window.history.replaceState(null, "", LINE_WORKFLOW_GATEWAY_PATH);
        try {
          setExternalBrowser(!liff.isInClient());
        } catch {
          setExternalBrowser(true);
        }
      }
      if (result === "READY") await verify();
      else setState(result);
    });
    // A restored BFCache page must not resume an earlier attempt without fresh checks.
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [liffId, status, verify]);

  function retry(): void {
    if (state === "INIT_FAILED") {
      window.location.replace(LINE_WORKFLOW_GATEWAY_PATH);
      return;
    }
    void verify();
  }

  function startLineLogin(): void {
    try {
      liff.login({ redirectUri: lineLoginRedirectUri });
    } catch {
      setState("INIT_FAILED");
    }
  }

  function startDemiLogin(): void {
    const store = sessionStore();
    if (store) markLineWorkflowLoginAttempt(store);
  }

  return (
    <LineWorkflowScreen
      state={state}
      loginHref={loginHref}
      repeatedLogin={repeatedLogin}
      externalBrowser={externalBrowser}
      onRetry={retry}
      onLineLogin={startLineLogin}
      onDemiLogin={startDemiLogin}
    />
  );
}
