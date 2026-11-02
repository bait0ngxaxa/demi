"use client";

import { useCallback, useRef, useState, type RefObject } from "react";

type RetainedDraft<T> = { contextKey: string; value: T };

/**
 * Keeps the unsaved values of one edit dialog in component memory after it closes, so reopening
 * the same task (same `contextKey`, normally resource ID + version) continues where the user
 * stopped. A different key never receives that draft. Nothing is written to browser storage.
 *
 * The editor writes its current values to `draftRef` (in an effect); the owner calls `retain`
 * from its close handler and `clear` after a confirmed save, a context change or lost authority.
 */
export function useRetainedDraft<T>(): {
  draftRef: RefObject<T | null>;
  retained: (contextKey: string) => T | undefined;
  retain: (contextKey: string) => void;
  clear: () => void;
} {
  const draftRef = useRef<T | null>(null);
  const [draft, setDraft] = useState<RetainedDraft<T> | null>(null);

  const retained = useCallback(
    (contextKey: string): T | undefined => (draft?.contextKey === contextKey ? draft.value : undefined),
    [draft],
  );

  const retain = useCallback((contextKey: string): void => {
    const value = draftRef.current;
    draftRef.current = null;
    setDraft(value === null ? null : { contextKey, value });
  }, []);

  const clear = useCallback((): void => {
    draftRef.current = null;
    setDraft(null);
  }, []);

  return { draftRef, retained, retain, clear };
}
