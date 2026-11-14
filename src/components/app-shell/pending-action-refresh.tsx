"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Recheck server authorization and business queues on return; no polling or local counter mutations. */
export function PendingActionRefresh(): null {
  const router = useRouter();
  const lastRefresh = useRef(0);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    lastRefresh.current = Date.now();
  }, []);
  useEffect(() => {
    function refresh(): void {
      if (document.visibilityState !== "visible" || pending || Date.now() - lastRefresh.current < 30_000) return;
      const main = document.getElementById("application-main-content");
      if (main?.querySelector('[data-navigation-guard="unknown-outcome"], button[aria-busy="true"][disabled]')) return;
      lastRefresh.current = Date.now();
      startTransition(() => router.refresh());
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pending, router]);
  return null;
}
