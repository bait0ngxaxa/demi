"use client";

import { useEffect } from "react";

import { getLiffBrowserContextSnapshot } from "@/components/line/liff-browser-context-store";
import { isWorkspaceLiffContext } from "@/modules/line/domain/line-liff-browser";

import {
  clearWorkspaceLiffEntryAttempts,
  isLineLoginReturnSearch,
  loadWorkspaceLiffSdk,
  sessionAttemptStore,
  startWorkspaceLiffEntry,
  type WorkspaceLiffSdkLoader,
} from "../workspace-liff-gateway";

/**
 * LINE: "LIFF apps must be initialized each time a page is opened." The root
 * entry initializes the primary redirect; this boundary initializes every
 * later `/app` document (the secondary redirect target, reloads, full-document
 * navigation, returns from the Account LIFF) with the Workspace LIFF ID.
 *
 * - Runs only in a Workspace LIFF browser session (marked at `/` when the SDK
 *   reported `isInClient()`), so ordinary browsers never load the SDK and a
 *   MINI App or Account LIFF browser is never initialized with this ID.
 * - Mounted once in the `/app` layout: internal Next.js navigation keeps the
 *   initialized document; the gateway's single-flight keeps remounts from
 *   initializing twice and lets a failed or timed-out attempt be retried by
 *   the next document.
 * - Renders nothing and never changes the URL; the SDK consumes its own
 *   parameters. Its outcome is transport state, never DEMI authentication.
 */
export function WorkspaceLiffBootstrap({
  liffId,
  load = loadWorkspaceLiffSdk,
}: {
  liffId: string | null;
  load?: WorkspaceLiffSdkLoader;
}): null {
  useEffect(() => {
    if (!liffId || !isWorkspaceLiffContext(getLiffBrowserContextSnapshot())) return;
    let active = true;
    void startWorkspaceLiffEntry(load, liffId, sessionAttemptStore(), isLineLoginReturnSearch(window.location.search)).then((result) => {
      if (active && result === "READY") clearWorkspaceLiffEntryAttempts(sessionAttemptStore());
    });
    return () => {
      active = false;
    };
  }, [liffId, load]);
  return null;
}
