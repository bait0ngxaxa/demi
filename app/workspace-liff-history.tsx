"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { getCurrentDocumentLiffApp, recordCurrentWorkspaceInitResult } from "@/components/line/liff-browser-context-store";
import { markWorkspaceLiffHistoryEntry } from "@/components/line/workspace-liff-document";

import { isWorkspaceLiffInitializationReady } from "./workspace-liff-gateway";

/** Persist only entries actually visited by this initialized document. No SDK loading. */
export function WorkspaceLiffHistory({ liffId }: { liffId: string | null }): null {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (!liffId || !isWorkspaceLiffInitializationReady(liffId) || getCurrentDocumentLiffApp() !== "WORKSPACE") return;
    markWorkspaceLiffHistoryEntry(liffId);
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted && getCurrentDocumentLiffApp() === "WORKSPACE") recordCurrentWorkspaceInitResult("READY");
    };
    const onPageHide = (): void => {
      if (getCurrentDocumentLiffApp() === "WORKSPACE") markWorkspaceLiffHistoryEntry(liffId);
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [liffId, pathname, search]);
  return null;
}
