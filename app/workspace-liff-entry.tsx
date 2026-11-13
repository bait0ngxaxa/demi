"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { SLOW_LOADING_HINT, useSlowLoadingHint } from "@/components/line/use-slow-loading-hint";

import { recordCurrentLiffBrowserEntry, recordCurrentWorkspaceInitResult } from "@/components/line/liff-browser-context-store";
import { clearWorkspaceLiffHandoff, prepareWorkspaceLiffHandoff } from "@/components/line/workspace-liff-document";
import { hasLiffCredentialFragment } from "@/modules/line/domain/line-workspace-liff-entry";

import {
  clearWorkspaceLiffEntryAttempts,
  hasWorkspaceLiffInitialization,
  isLineLoginReturnSearch,
  loadWorkspaceLiffSdk,
  sessionAttemptStore,
  startWorkspaceLiffEntry,
  type WorkspaceLiffSdkLoader,
} from "./workspace-liff-gateway";

/** Decided on the server before any SDK work. */
export type WorkspaceLiffEntryMode = "ORDINARY" | "LIFF" | "NAVIGATION_INVALID";
export type WorkspaceLiffEntryState = "CONTINUING" | "REDIRECTING" | "INITIALIZING" | "INIT_FAILED" | "UNAVAILABLE" | "NAVIGATION_INVALID" | "LOOP_STOPPED" | "CONTINUATION_FAILED";

type Copy = { title: string; body: string; busy?: boolean };

const copy: Record<WorkspaceLiffEntryState, Copy> = {
  CONTINUING: { title: "กำลังเปิด DEMI", body: "กรุณารอสักครู่", busy: true },
  INITIALIZING: { title: "กำลังเชื่อมต่อกับ LINE", body: "กรุณารอสักครู่", busy: true },
  REDIRECTING: { title: "กำลังเปิดหน้า DEMI", body: "กรุณารอสักครู่", busy: true },
  INIT_FAILED: { title: "เปิดผ่าน LINE ไม่สำเร็จ", body: "กรุณาปิดหน้านี้แล้วเปิดจากเมนู DEMI ใน LINE อีกครั้ง" },
  UNAVAILABLE: { title: "ยังเปิด DEMI ผ่าน LINE ไม่ได้", body: "บริการนี้ยังไม่พร้อมใช้งานใน LINE คุณยังใช้ DEMI บนเว็บได้ตามปกติ" },
  NAVIGATION_INVALID: { title: "ลิงก์นี้ไม่ถูกต้อง", body: "กรุณาปิดหน้านี้แล้วเปิดจากเมนู DEMI ใน LINE อีกครั้ง" },
  LOOP_STOPPED: { title: "เปิดผ่าน LINE ซ้ำหลายครั้ง", body: "ระบบหยุดการเปิดซ้ำไว้ก่อน กรุณาปิดหน้านี้แล้วเปิดจากเมนู DEMI ใน LINE อีกครั้ง" },
  CONTINUATION_FAILED: { title: "เชื่อมต่อ DEMI ไม่สำเร็จ", body: "ระบบหยุดการโหลดซ้ำไว้ก่อน กรุณาตรวจสอบการเชื่อมต่อแล้วลองเปิดอีกครั้งภายหลัง หากเปิดจาก LINE ให้ปิดหน้านี้แล้วเปิดจากเมนู DEMI ใน LINE" },
};

export function WorkspaceLiffEntryScreen({
  state,
}: {
  state: WorkspaceLiffEntryState;
}): React.JSX.Element {
  const current = copy[state];
  const showSlowHint = useSlowLoadingHint(state, Boolean(current.busy));
  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <p className="text-sm font-semibold text-brand">DEMI</p>
        </header>
        <section aria-labelledby="workspace-liff-status" aria-busy={current.busy ? true : undefined} className="rounded-panel border border-line bg-surface p-5 shadow-surface sm:p-7">
          <div className="space-y-4" role="status" aria-live="polite">
            {current.busy ? <LoadingIndicator size="md" /> : null}
            <h1 id="workspace-liff-status" className="text-2xl font-semibold">{current.title}</h1>
            <p className="type-readable text-base text-muted">{current.body}</p>
            {showSlowHint ? <p className="text-sm text-muted">{SLOW_LOADING_HINT}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

/**
 * Root entry for ordinary browsers and the Workspace LIFF primary redirect.
 * The LIFF SDK is loaded only when LIFF parameters or credentials are present;
 * LINE initialization is UI transport state, never DEMI authentication.
 */
export function WorkspaceLiffEntry({
  mode,
  liffId,
  destination,
  fallbackHref,
  load = loadWorkspaceLiffSdk,
}: {
  mode: WorkspaceLiffEntryMode;
  liffId: string | null;
  /** Allowlisted destination from `liff.state`; null continues to `fallbackHref`. */
  destination: string | null;
  fallbackHref: string;
  load?: WorkspaceLiffSdkLoader;
}): React.JSX.Element {
  const [state, setState] = useState<WorkspaceLiffEntryState>(
    mode === "NAVIGATION_INVALID" ? "NAVIGATION_INVALID"
      : mode === "LIFF" && !liffId ? "UNAVAILABLE"
        : mode === "LIFF" ? "INITIALIZING" : !liffId ? "UNAVAILABLE" : "CONTINUING",
  );

  useEffect(() => {
    if (mode === "NAVIGATION_INVALID" || (mode === "LIFF" && !liffId)) {
      // Never initialize another identity or edit SDK-owned parameters.
      return;
    }
    if (mode === "ORDINARY" && !hasLiffCredentialFragment(window.location.hash)) {
      queueMicrotask(() => {
        flushSync(() => setState("REDIRECTING"));
        window.location.replace(fallbackHref);
      });
      return;
    }
    if (!liffId) {
      // Credentials exist but there is no configured SDK identity to consume them.
      return;
    }
    let active = true;
    // No URL change before init resolves: the SDK consumes liff.state and credentials first.
    void startWorkspaceLiffEntry(load, liffId, sessionAttemptStore(), isLineLoginReturnSearch(window.location.search), {
      // Scopes Workspace-only behavior (Account LIFF links, per-page init) to a LIFF browser session the SDK
      // itself reports (liff.isInClient() is documented as callable before init). Presentation state, never authority.
      onSdkLoaded: (sdk) => {
        if (sdk.isInClient()) {
          recordCurrentLiffBrowserEntry("WORKSPACE");
          if (destination) prepareWorkspaceLiffHandoff(liffId, destination);
        }
      },
    }).then((result) => {
      // Recorded even after unmount: it describes this document's SDK state, never authority.
      if (result === "READY" || result === "INIT_FAILED") recordCurrentWorkspaceInitResult(result === "READY" ? "READY" : "FAILED");
      if (!active) return;
      if (result === "READY") {
        // Reached only when the SDK did not perform the secondary redirect itself.
        clearWorkspaceLiffEntryAttempts(sessionAttemptStore());
        prepareWorkspaceLiffHandoff(liffId, destination ?? fallbackHref);
        // Commit the progress copy before handing this document to the browser.
        flushSync(() => setState("REDIRECTING"));
        window.location.replace(destination ?? fallbackHref);
        return;
      }
      if (!hasWorkspaceLiffInitialization(liffId)) clearWorkspaceLiffHandoff();
      // The root entry is always a fresh document, so another LIFF app cannot own it; treat it as a failure.
      setState(result === "OTHER_LIFF_APP" ? "INIT_FAILED" : result);
    });
    // A BFCache-restored entry must not resume an earlier attempt.
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) setState("INIT_FAILED");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [destination, fallbackHref, liffId, load, mode]);

  return (
    <>
      <WorkspaceLiffEntryScreen state={state} />
      {/* Inert when JavaScript/SDK work can run; preserves the ordinary root's no-script exit. */}
      {mode === "ORDINARY" ? (
        <noscript>
          <p className="px-4 pb-8 text-center text-ink">
            <a className="font-semibold text-brand underline" href={fallbackHref}>ไปที่ DEMI</a>
          </p>
        </noscript>
      ) : null}
    </>
  );
}
