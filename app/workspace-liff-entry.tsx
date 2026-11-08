"use client";

import { useEffect, useState } from "react";

import { recordCurrentLiffBrowserEntry, recordCurrentWorkspaceInitResult } from "@/components/line/liff-browser-context-store";
import { hasLiffCredentialFragment } from "@/modules/line/domain/line-workspace-liff-entry";

import {
  clearWorkspaceLiffEntryAttempts,
  isLineLoginReturnSearch,
  loadWorkspaceLiffSdk,
  sessionAttemptStore,
  startWorkspaceLiffEntry,
  type WorkspaceLiffSdkLoader,
} from "./workspace-liff-gateway";

/** Decided on the server before any SDK work. */
export type WorkspaceLiffEntryMode = "ORDINARY" | "LIFF" | "NAVIGATION_INVALID";
export type WorkspaceLiffEntryState = "CONTINUING" | "INITIALIZING" | "INIT_FAILED" | "UNAVAILABLE" | "NAVIGATION_INVALID" | "LOOP_STOPPED";

type Copy = { title: string; body: string; busy?: boolean };

const copy: Record<WorkspaceLiffEntryState, Copy> = {
  CONTINUING: { title: "กำลังเปิด DEMI", body: "กรุณารอสักครู่", busy: true },
  INITIALIZING: { title: "กำลังเปิด DEMI ผ่าน LINE", body: "กรุณารอสักครู่", busy: true },
  INIT_FAILED: { title: "เปิดผ่าน LINE ไม่สำเร็จ", body: "กรุณาลองใหม่ หากยังไม่สำเร็จให้ปิดแล้วเปิดจากเมนู DEMI ใน LINE อีกครั้ง" },
  UNAVAILABLE: { title: "ยังเปิด DEMI ผ่าน LINE ไม่ได้", body: "บริการนี้ยังไม่พร้อมใช้งานใน LINE คุณยังใช้ DEMI บนเว็บได้ตามปกติ" },
  NAVIGATION_INVALID: { title: "ลิงก์นี้ไม่ถูกต้อง", body: "กรุณาปิดหน้านี้แล้วเปิดจากเมนู DEMI ใน LINE อีกครั้ง" },
  LOOP_STOPPED: { title: "เปิดผ่าน LINE ซ้ำหลายครั้ง", body: "ระบบหยุดการเปิดซ้ำไว้ก่อน แตะ “ไปที่ DEMI” เพื่อไปต่อ" },
};

const primaryButtonClass = "inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 text-center font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring";
const secondaryButtonClass = "inline-flex min-h-12 w-full items-center justify-center rounded-control border border-line-strong bg-surface px-5 py-3 text-center font-semibold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring";

/** Removes LIFF query/fragment credentials when LIFF will not consume them. */
function discardPlatformParameters(): void {
  window.history.replaceState(null, "", "/");
}

export function WorkspaceLiffEntryScreen({
  state,
  continueHref,
  onRetry,
}: {
  state: WorkspaceLiffEntryState;
  continueHref: string;
  onRetry?: () => void;
}): React.JSX.Element {
  const current = copy[state];
  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <p className="text-sm font-semibold text-brand">DEMI</p>
        </header>
        <section aria-labelledby="workspace-liff-status" aria-busy={current.busy ? true : undefined} className="rounded-panel border border-line bg-surface p-5 shadow-surface sm:p-7">
          <div className="space-y-4" role="status" aria-live="polite">
            <h1 id="workspace-liff-status" className="text-2xl font-semibold">{current.title}</h1>
            <p className="type-readable text-base text-muted">{current.body}</p>
          </div>
          <div className="mt-6 space-y-3">
            {state === "INIT_FAILED" ? (
              <button type="button" onClick={onRetry} className={primaryButtonClass}>ลองอีกครั้ง</button>
            ) : null}
            {/* A plain document link: leaves the LIFF entry without reusing platform parameters. */}
            <a href={continueHref} className={current.busy ? "inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring" : secondaryButtonClass}>
              {current.busy ? "หากหน้าไม่เปลี่ยน แตะที่นี่เพื่อไปต่อ" : "ไปที่ DEMI"}
            </a>
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
        : mode === "LIFF" ? "INITIALIZING" : "CONTINUING",
  );

  useEffect(() => {
    if (mode === "NAVIGATION_INVALID" || (mode === "LIFF" && !liffId)) {
      // Never initialize another LIFF identity; drop parameters and credentials LIFF will not consume.
      discardPlatformParameters();
      return;
    }
    if (mode === "ORDINARY" && !hasLiffCredentialFragment(window.location.hash)) {
      window.location.replace(fallbackHref);
      return;
    }
    if (!liffId) {
      // Bare LIFF launch without Workspace configuration: drop the credentials and continue on the web.
      discardPlatformParameters();
      window.location.replace(fallbackHref);
      return;
    }
    let active = true;
    // No URL change before init resolves: the SDK consumes liff.state and credentials first.
    void startWorkspaceLiffEntry(load, liffId, sessionAttemptStore(), isLineLoginReturnSearch(window.location.search), {
      // Scopes Workspace-only behavior (Account LIFF links, per-page init) to a LIFF browser session the SDK
      // itself reports (liff.isInClient() is documented as callable before init). Presentation state, never authority.
      onSdkLoaded: (sdk) => {
        if (sdk.isInClient()) recordCurrentLiffBrowserEntry("WORKSPACE");
      },
    }).then((result) => {
      // Recorded even after unmount: it describes this document's SDK state, never authority.
      if (result === "READY" || result === "INIT_FAILED") recordCurrentWorkspaceInitResult(result === "READY" ? "READY" : "FAILED");
      if (!active) return;
      if (result === "READY") {
        // Reached only when the SDK did not perform the secondary redirect itself.
        clearWorkspaceLiffEntryAttempts(sessionAttemptStore());
        window.location.replace(destination ?? fallbackHref);
        return;
      }
      if (result === "LOOP_STOPPED") discardPlatformParameters();
      // The root entry is always a fresh document, so another LIFF app cannot own it; treat it as a failure.
      setState(result === "OTHER_LIFF_APP" ? "INIT_FAILED" : result);
    });
    // A BFCache-restored entry must not resume an earlier attempt.
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [destination, fallbackHref, liffId, load, mode]);

  // Leaving through a document link keeps the same browser; it only skips LIFF SDK work.
  const continueHref = state === "NAVIGATION_INVALID" ? fallbackHref : destination ?? fallbackHref;
  return <WorkspaceLiffEntryScreen state={state} continueHref={continueHref} onRetry={() => window.location.reload()} />;
}
