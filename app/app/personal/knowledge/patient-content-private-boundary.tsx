"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Bounded request-generation metadata only. Never stores Patient identity or Content payload.
const retiredRequests = new Set<string>();
let retirementLimitReached = false;
function retire(requestId: string): void {
  if (!retirementLimitReached) retiredRequests.add(requestId);
  if (retiredRequests.size >= 64) retirementLimitReached = true;
}

export function PatientContentPrivateBoundary({ requestId, children }: {
  requestId: string;
  children: ReactNode;
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const generation = useRef({ value: 0 });
  const [trusted, setTrusted] = useState(true);
  useLayoutEffect(() => {
    const lifetime = generation.current;
    const currentGeneration = ++lifetime.value;
    const invalidate = (): void => {
      retire(requestId);
      // Hide synchronously before browser history/BFCache can expose active private links.
      if (root.current) { root.current.hidden = true; root.current.inert = true; }
      setTrusted(false);
    };
    const reload = (): void => { invalidate(); window.location.reload(); };
    const restored = (event: PageTransitionEvent): void => { if (event.persisted) reload(); };
    const visible = (): void => { if (document.visibilityState === "visible") reload(); };
    if (retirementLimitReached || retiredRequests.has(requestId)) reload();
    window.addEventListener("pagehide", invalidate);
    window.addEventListener("pageshow", restored);
    window.addEventListener("popstate", reload);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("pagehide", invalidate);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("popstate", reload);
      document.removeEventListener("visibilitychange", visible);
      // Strict Mode immediately replays the effect. Only a real unmount/cache suspension retires it.
      queueMicrotask(() => { if (lifetime.value === currentGeneration) retire(requestId); });
    };
  }, [requestId]);
  return <div ref={root} hidden={!trusted} inert={!trusted}>{trusted ? children : null}</div>;
}
