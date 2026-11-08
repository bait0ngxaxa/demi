import {
  LIFF_BROWSER_CONTEXT_KEY,
  WORKSPACE_LIFF_HANDOFF_KEY,
  readLiffBrowserContext,
  recordLiffBrowserEntry,
  recordWorkspaceInitResult,
  type LiffBrowserApp,
  type LiffBrowserContext,
} from "@/modules/line/domain/line-liff-browser";

/**
 * Browser-side access to the LIFF browser context in session storage, with a
 * subscription so links re-render when an entry or initialization result is
 * recorded. Presentation state only.
 */
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedContext: LiffBrowserContext | null = null;
// This document only; unlike sessionStorage this does not survive navigation.
let currentDocumentApp: LiffBrowserApp | null = null;

export function getCurrentDocumentLiffApp(): LiffBrowserApp | null {
  return currentDocumentApp;
}

export function browserSessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Stable snapshot for useSyncExternalStore: the same object until the stored value changes. */
export function getLiffBrowserContextSnapshot(): LiffBrowserContext | null {
  const store = browserSessionStore();
  let raw: string | null = null;
  try {
    raw = store?.getItem(LIFF_BROWSER_CONTEXT_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedContext = readLiffBrowserContext(store);
  }
  return cachedContext;
}

export function subscribeLiffBrowserContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLiffBrowserContextChanged(): void {
  for (const listener of [...listeners]) listener();
}

export function recordCurrentLiffBrowserEntry(app: LiffBrowserApp): void {
  currentDocumentApp = app;
  if (app !== "WORKSPACE") {
    try {
      browserSessionStore()?.removeItem(WORKSPACE_LIFF_HANDOFF_KEY);
    } catch {
      // No transport handoff can be recovered when storage is unavailable.
    }
  }
  if (recordLiffBrowserEntry(browserSessionStore(), app)) notifyLiffBrowserContextChanged();
}

export function recordCurrentWorkspaceInitResult(result: "READY" | "FAILED"): void {
  if (recordWorkspaceInitResult(browserSessionStore(), result)) notifyLiffBrowserContextChanged();
}
