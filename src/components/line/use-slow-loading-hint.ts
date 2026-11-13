"use client";

import { useEffect, useState } from "react";

export const SLOW_LOADING_HINT = "ใช้เวลานานกว่าปกติ อาจเป็นเพราะสัญญาณอินเทอร์เน็ต";

/** Each stage gets its own wait; stale timers cannot reveal a previous stage's hint. */
export function useSlowLoadingHint(state: string, busy: boolean): boolean {
  const [slowState, setSlowState] = useState<string | null>(null);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlowState(state), 5_000);
    return () => clearTimeout(timer);
  }, [state, busy]);
  // Reset on stage changes before paint, including returning to a previous stage.
  const [previousState, setPreviousState] = useState(state);
  if (previousState !== state) {
    setPreviousState(state);
    setSlowState(null);
  }
  return busy && slowState === state;
}
