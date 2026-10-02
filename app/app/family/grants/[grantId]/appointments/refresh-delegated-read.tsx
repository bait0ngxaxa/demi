"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh on returning to an existing view; does not promise recall of previously displayed data. */
export function RefreshDelegatedRead(): null {
  const router = useRouter();
  useEffect(() => {
    const refresh = (): void => { router.refresh(); };
    const visible = (): void => { if (document.visibilityState === "visible") refresh(); };
    const restored = (event: PageTransitionEvent): void => { if (event.persisted) refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", restored);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restored);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [router]);
  return null;
}
