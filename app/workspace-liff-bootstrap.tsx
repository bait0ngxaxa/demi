"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { recordCurrentLiffBrowserEntry, recordCurrentWorkspaceInitResult } from "@/components/line/liff-browser-context-store";
import { clearWorkspaceLiffHandoff, consumeWorkspaceLiffHandoff, isWorkspaceLiffHistoryEntry, markWorkspaceLiffHistoryEntry, prepareWorkspaceLiffSdkReturn } from "@/components/line/workspace-liff-document";
import { isLinePlatformParameterName } from "@/modules/line/domain/line-navigation-intents";
import { hasLiffCredentialFragment } from "@/modules/line/domain/line-workspace-liff-entry";

import { WorkspaceLiffEntryScreen, type WorkspaceLiffEntryState } from "./workspace-liff-entry";
import { clearWorkspaceLiffEntryAttempts, hasWorkspaceLiffInitialization, isLineLoginReturnSearch, loadWorkspaceLiffSdk, sessionAttemptStore, startWorkspaceLiffEntry, type WorkspaceLiffSdkLoader } from "./workspace-liff-gateway";

/**
 * Proxy rewrites document GETs to this public shell. The protected tree
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
    let active = true;
    const initializeDocument = async (): Promise<Awaited<ReturnType<typeof startWorkspaceLiffEntry>> | "ORDINARY"> => {
      const handoff = liffId ? consumeWorkspaceLiffHandoff(liffId) : false;
      if (!liffId || (!handoff && !isWorkspaceLiffHistoryEntry(liffId) && !hasWorkspaceLiffInitialization(liffId))) {
        // A callback with lost/expired storage cannot establish Workspace identity.
        // It also cannot safely continue and discard SDK-owned parameters.
        const platformReturn = isLineLoginReturnSearch(window.location.search) || hasLiffCredentialFragment(window.location.hash) ||
          [...new URLSearchParams(window.location.search).keys()].some(isLinePlatformParameterName);
        return platformReturn ? "INIT_FAILED" : "ORDINARY";
      }
      return startWorkspaceLiffEntry(load, liffId, sessionAttemptStore(), isLineLoginReturnSearch(window.location.search), {
        onSdkLoaded: (sdk) => {
          if (sdk.isInClient()) {
            recordCurrentLiffBrowserEntry("WORKSPACE");
            prepareWorkspaceLiffSdkReturn(liffId);
          }
        },
      });
    };
    void initializeDocument().then((result) => {
      if (!active) return;
      if (result === "READY" || result === "ORDINARY") {
        clearWorkspaceLiffHandoff();
        if (result === "READY" && liffId) {
          clearWorkspaceLiffEntryAttempts(sessionAttemptStore());
          recordCurrentWorkspaceInitResult("READY");
          markWorkspaceLiffHistoryEntry(liffId);
        }
        if (!continued.current) {
          continued.current = true;
          router.refresh();
        }
      } else {
        // A timeout cannot cancel a later SDK redirect. Actual rejection can.
        if (!liffId || !hasWorkspaceLiffInitialization(liffId)) clearWorkspaceLiffHandoff();
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
