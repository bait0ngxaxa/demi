import { canonicalizeLineEntryPath } from "@/modules/line/domain/line-navigation-intents";
import { WORKSPACE_LIFF_HANDOFF_KEY } from "@/modules/line/domain/line-liff-browser";
import { LINE_WORKSPACE_LIFF_DESTINATIONS } from "@/modules/line/domain/line-workspace-liff-entry";

import { browserSessionStore } from "./liff-browser-context-store";

const HISTORY_KEY = "demiWorkspaceLiff";
const HANDOFF_TTL_MS = 60_000;

function isWorkspaceDocumentPath(path: string): boolean {
  return path.length <= 4096 && (path === "/app" || path.startsWith("/app/") || path.startsWith("/app?") ||
    path === "/login" || path.startsWith("/login?"));
}

function writeHandoff(liffId: string, destination: string): void {
  try {
    browserSessionStore()?.setItem(WORKSPACE_LIFF_HANDOFF_KEY, JSON.stringify({ liffId, destination, expires: Date.now() + HANDOFF_TTL_MS }));
  } catch {
    // Without storage the next document cannot infer Workspace ownership.
  }
}

/** One root redirect to one approved destination; not a session identity. */
export function prepareWorkspaceLiffHandoff(liffId: string, destination: string): void {
  if (destination === "/login" || LINE_WORKSPACE_LIFF_DESTINATIONS.includes(destination)) writeHandoff(liffId, destination);
}

/**
 * An already-proven Workspace document may be sent to LINE Login by its SDK.
 * Match only that document's current URL on return. This value is never followed
 * as a URL and never becomes DEMI's login returnTo (which keeps its allowlist).
 */
export function prepareWorkspaceLiffSdkReturn(liffId: string): void {
  const path = canonicalizeLineEntryPath(new URL(window.location.href));
  if (path !== null && isWorkspaceDocumentPath(path)) writeHandoff(liffId, path);
}

export function clearWorkspaceLiffHandoff(): void {
  try {
    browserSessionStore()?.removeItem(WORKSPACE_LIFF_HANDOFF_KEY);
  } catch {
    // Storage unavailable; no future document can consume it here either.
  }
}

/** Consumed even on mismatch: a historical primary entry cannot own a later page. */
export function consumeWorkspaceLiffHandoff(liffId: string): boolean {
  try {
    const store = browserSessionStore();
    const raw = store?.getItem(WORKSPACE_LIFF_HANDOFF_KEY);
    store?.removeItem(WORKSPACE_LIFF_HANDOFF_KEY);
    if (!raw || raw.length > 8192) return false;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return false;
    const { liffId: owner, destination, expires } = value as Record<string, unknown>;
    return owner === liffId && typeof destination === "string" &&
      isWorkspaceDocumentPath(destination) &&
      typeof expires === "number" && expires > Date.now() && expires <= Date.now() + HANDOFF_TTL_MS &&
      canonicalizeLineEntryPath(new URL(window.location.href)) === destination;
  } catch {
    return false;
  }
}

/** A marker belongs to this history entry, not the session's last LIFF app. */
export function isWorkspaceLiffHistoryEntry(liffId: string): boolean {
  try {
    const state: unknown = window.history.state;
    return typeof state === "object" && state !== null &&
      (state as Record<string, unknown>)[HISTORY_KEY] === liffId;
  } catch {
    return false;
  }
}

/** Only after init settles successfully. Preserve Next.js's own history state. */
export function markWorkspaceLiffHistoryEntry(liffId: string): void {
  try {
    window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: liffId }, "");
  } catch {
    // Unavailable history storage disables restoration, never server access checks.
  }
}
