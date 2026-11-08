"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { recordCurrentLiffBrowserEntry, recordCurrentWorkspaceInitResult } from "@/components/line/liff-browser-context-store";
import { consumeWorkspaceLiffHandoff, isWorkspaceLiffHistoryEntry, markWorkspaceLiffHistoryEntry } from "@/components/line/workspace-liff-document";

import { WorkspaceLiffEntryScreen, type WorkspaceLiffEntryState } from "./workspace-liff-entry";
import { clearWorkspaceLiffEntryAttempts, hasWorkspaceLiffInitialization, isLineLoginReturnSearch, loadWorkspaceLiffSdk, sessionAttemptStore, startWorkspaceLiffEntry, type WorkspaceLiffSdkLoader } from "./workspace-liff-gateway";

/**
 * Proxy serves this public shell for document GETs only. The protected tree
 * (including its server redirects and meta refresh) is requested via RSC only
 * after the document's required transport initialization has completed.
 * Ordinary web documents request it immediately, without loading the SDK.
 */
export function WorkspaceLiffBootstrap({
  liffId,
  load = loadWorkspaceLiffSdk,
}: {
  liffId: string | null;
  load?: WorkspaceLiffSdkLoader;
}): React.JSX.Element {
  const router = useRouter();
  const [state, setState] = useState<WorkspaceLiffEntryState>("CONTINUING");
  const continued = useRef(false);

  useEffect(() => {
    if (window.location.pathname === "/workspace-liff-document") {
      router.replace("/login");
      return;
    }
    const handoff = liffId ? consumeWorkspaceLiffHandoff(liffId) : false;
    if (!liffId || (!handoff && !isWorkspaceLiffHistoryEntry(liffId) && !hasWorkspaceLiffInitialization(liffId))) {
      if (!continued.current) {
        continued.current = true;
        router.refresh();
      }
      return;
    }
    let active = true;
    void startWorkspaceLiffEntry(load, liffId, sessionAttemptStore(), isLineLoginReturnSearch(window.location.search), {
      onSdkLoaded: (sdk) => {
        if (sdk.isInClient()) recordCurrentLiffBrowserEntry("WORKSPACE");
      },
    }).then((result) => {
      if (!active) return;
      if (result === "READY") {
        clearWorkspaceLiffEntryAttempts(sessionAttemptStore());
        recordCurrentWorkspaceInitResult("READY");
        markWorkspaceLiffHistoryEntry(liffId);
        if (!continued.current) {
          continued.current = true;
          router.refresh();
        }
      } else {
        recordCurrentWorkspaceInitResult("FAILED");
        setState(result === "LOOP_STOPPED" ? "LOOP_STOPPED" : "INIT_FAILED");
      }
    });
    return () => { active = false; };
  }, [liffId, load, router]);

  // Timeout cannot cancel the SDK: recovery uses LINE's own close/reopen UI.
  return (
    <>
      <WorkspaceLiffEntryScreen state={state} />
      <noscript><p className="px-4 pb-8 text-center text-ink">กรุณาเปิด JavaScript เพื่อใช้งาน DEMI</p></noscript>
    </>
  );
}
