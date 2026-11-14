"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Minimum age of the shell's server-rendered indicators before a client signal re-requests them. */
export const PENDING_ACTION_REFRESH_INTERVAL_MS = 30_000;

const UNSAFE_REFRESH_SELECTOR = '[data-navigation-guard="unknown-outcome"], button[aria-busy="true"][disabled]';

/**
 * Shared layouts are not re-rendered on App Router navigation, so the shell's indicators age while the user moves
 * between pages. This re-requests server authorization and business queues via `router.refresh()` when a client signal
 * (focus, visibility, pathname change) finds them older than the interval. No timer, polling or local counter.
 *
 * `checkedAt` changes on every server render of the shell — initial load, `router.refresh()` and Server Action
 * revalidation of `/app` — which marks the indicators fresh, so a mutation's revalidation suppresses a redundant
 * refresh and a refresh cannot trigger another (the pathname does not change and the new data is fresh).
 */
export function PendingActionRefresh({ checkedAt }: { checkedAt: number }): null {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const freshAt = useRef(0);
  const refreshing = useRef(false);
  const previousPathname = useRef(pathname);

  // Declared first: on a commit that delivers both new server data and a new pathname, freshness is recorded before
  // the pathname effect evaluates it.
  useEffect(() => {
    freshAt.current = Date.now();
    refreshing.current = false;
  }, [checkedAt]);

  useEffect(() => {
    if (!pending) refreshing.current = false;
  }, [pending]);

  const refreshIfStale = useCallback((): void => {
    if (document.visibilityState !== "visible" || refreshing.current) return;
    if (Date.now() - freshAt.current < PENDING_ACTION_REFRESH_INTERVAL_MS) return;
    // Never interrupt a pending form, an unknown-outcome recovery or an in-progress workflow transition.
    if (document.getElementById("application-main-content")?.querySelector(UNSAFE_REFRESH_SELECTOR)) return;
    refreshing.current = true;
    // Also throttles retries if the refresh fails and no new server render arrives.
    freshAt.current = Date.now();
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    refreshIfStale();
  }, [pathname, refreshIfStale]);

  useEffect(() => {
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [refreshIfStale]);

  return null;
}
