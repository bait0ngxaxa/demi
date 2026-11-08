"use client";

import { useEffect, useState } from "react";

import { getLiffBrowserContextSnapshot, recordCurrentWorkspaceInitResult } from "@/components/line/liff-browser-context-store";
import { Alert } from "@/components/ui/alert";
import { shouldInitializeWorkspaceLiff } from "@/modules/line/domain/line-liff-browser";

import {
  clearWorkspaceLiffEntryAttempts,
  isLineLoginReturnSearch,
  loadWorkspaceLiffSdk,
  sessionAttemptStore,
  startWorkspaceLiffEntry,
  type WorkspaceLiffSdkLoader,
} from "./workspace-liff-gateway";

type BootstrapState = "IDLE" | "READY" | "FAILED" | "LOOP_STOPPED";

/**
 * LINE: "LIFF apps must be initialized each time a page is opened." The root
 * entry initializes the primary redirect; this boundary initializes every
 * later `/app` or `/login` document (secondary redirect target, the document
 * an auth redirect is streamed into, reloads, full-document navigation,
 * returns from the Account LIFF) with the Workspace LIFF ID.
 *
 * - Runs only when this browser session entered the Workspace LIFF and is not
 *   a MINI session, so ordinary browsers never load the SDK and the MINI App is
 *   never initialized with this ID.
 * - Records the outcome in the LIFF browser context: READY makes Workspace the
 *   current app again; FAILED never reads as initialized.
 * - No automatic retries. A failure shows a Thai notice with a reload, which
 *   starts a new document; DEMI keeps working as an ordinary web app.
 * - Never changes the URL; the SDK consumes its own parameters. Its outcome is
 *   transport state, never DEMI authentication or authorization.
 */
export function WorkspaceLiffBootstrap({
  liffId,
  load = loadWorkspaceLiffSdk,
}: {
  liffId: string | null;
  load?: WorkspaceLiffSdkLoader;
}): React.JSX.Element | null {
  const [state, setState] = useState<BootstrapState>("IDLE");

  useEffect(() => {
    if (!liffId || !shouldInitializeWorkspaceLiff(getLiffBrowserContextSnapshot())) return;
    let active = true;
    let documentReady = false;
    void startWorkspaceLiffEntry(load, liffId, sessionAttemptStore(), isLineLoginReturnSearch(window.location.search)).then((result) => {
      // Recorded even after unmount (e.g. a soft navigation to /login): it describes this document.
      if (result === "READY") {
        documentReady = true;
        clearWorkspaceLiffEntryAttempts(sessionAttemptStore());
        recordCurrentWorkspaceInitResult("READY");
      } else if (result === "INIT_FAILED") {
        recordCurrentWorkspaceInitResult("FAILED");
      }
      if (active) setState(result === "INIT_FAILED" ? "FAILED" : result);
    });
    // Back from the Account LIFF can restore this page from BFCache; it is the Workspace again.
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted && documentReady) recordCurrentWorkspaceInitResult("READY");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [liffId, load]);

  if (state !== "FAILED" && state !== "LOOP_STOPPED") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-3">
      <Alert className="pointer-events-auto mx-auto max-w-xl shadow-surface" variant="warning">
        <p className="font-semibold">เชื่อมต่อกับ LINE ไม่สำเร็จ</p>
        <p className="mt-1">
          {state === "LOOP_STOPPED"
            ? "ระบบหยุดการเชื่อมต่อซ้ำไว้ก่อน คุณยังใช้ DEMI ได้ตามปกติ หากต้องการให้ลองใหม่ ให้ปิดหน้านี้แล้วเปิดจากเมนู DEMI ใน LINE"
            : "คุณยังใช้ DEMI ได้ตามปกติ แต่บางการเปิดผ่าน LINE อาจไม่ทำงาน"}
        </p>
        {state === "FAILED" ? (
          <button
            className="mt-3 inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 py-2 font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
            onClick={() => window.location.reload()}
            type="button"
          >
            ลองเชื่อมต่ออีกครั้ง
          </button>
        ) : null}
      </Alert>
    </div>
  );
}
