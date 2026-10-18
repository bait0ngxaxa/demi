"use client";

import { useEffect, useState } from "react";

/**
 * A view restored from BFCache or the client router's history cache is not a
 * fresh authorization. Conceal it immediately and reload, so the server runs
 * every scoped check again; no-store alone does not prevent restoration.
 */
export function LineWorkflowScopedGuard({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const revalidate = (): void => {
      setStale(true);
      window.location.reload();
    };
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) revalidate();
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", revalidate);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", revalidate);
    };
  }, []);

  if (stale) {
    return (
      <p className="py-10 text-center text-base text-muted" role="status" aria-live="polite">
        กำลังตรวจสอบสิทธิ์อีกครั้ง
      </p>
    );
  }
  return <>{children}</>;
}
