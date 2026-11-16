/*
 * Browser-side Workspace LIFF entry steps. They decide transport only (whether
 * to let the LIFF SDK consume its redirect and where to continue); DEMI
 * authentication and every authorization decision stay on the server.
 */

export type WorkspaceLiffSdk = {
  init(config: { liffId: string; withLoginOnExternalBrowser?: boolean }): Promise<void>;
  /** Documented as callable before `liff.init()` resolves. */
  isInClient(): boolean;
  /** The LIFF ID passed to `liff.init()` in this document, or null before any init. */
  readonly id: string | null;
  /** Available after `liff.init()` resolves; null without the `openid` scope or grant. */
  getIDToken?(): string | null;
  /** Available after `liff.init()` resolves in the LIFF browser. */
  getAccessToken?(): string | null;
};

export type WorkspaceLiffSdkLoader = () => Promise<WorkspaceLiffSdk>;

export const loadWorkspaceLiffSdk: WorkspaceLiffSdkLoader = async () => (await import("@line/liff")).default;

export const WORKSPACE_LIFF_INIT_TIMEOUT_MS = 10_000;

/**
 * The one LIFF initialization of this document. A document only ever
 * initializes the Workspace LIFF ID it was given.
 *
 * - PENDING: concurrent callers share it.
 * - READY: kept, so remounts and internal navigation never call init again.
 * - Rejected: cleared, so a retry starts a fresh `liff.init()`.
 * - TIMED_OUT: a Promise timeout cannot cancel the SDK, which may still be
 *   working (or redirecting). Later callers in this document get INIT_FAILED
 *   without a second, racing `liff.init()`. If the SDK later rejects, the slot
 *   clears and a retry is allowed; if it later resolves, the slot becomes
 *   READY for later callers but never rewrites a result already returned.
 *   The user-facing retry is a reload, which starts a new document.
 */
type Initialization = { liffId: string; promise: Promise<void>; state: "PENDING" | "READY" | "TIMED_OUT"; sdk: WorkspaceLiffSdk | null };
let initialization: Initialization | null = null;

export function hasWorkspaceLiffInitialization(liffId: string): boolean {
  return initialization?.liffId === liffId;
}

export function isWorkspaceLiffInitializationReady(liffId: string): boolean {
  return initialization?.liffId === liffId && initialization.state === "READY";
}

/** The SDK this document initialized for `liffId`, only once that initialization is READY. */
export function readyWorkspaceLiffSdk(liffId: string): WorkspaceLiffSdk | null {
  return initialization?.liffId === liffId && initialization.state === "READY" ? initialization.sdk : null;
}

export type WorkspaceLiffInitOptions = {
  timeoutMs?: number;
  /** Runs once, after the SDK loads and before `liff.init()`; it must not change the URL. */
  onSdkLoaded?: (sdk: WorkspaceLiffSdk) => void;
};

/** This document's SDK was initialized by another LIFF app; not a Workspace failure. */
const otherLiffApp = new Error("Another LIFF app initialized this document");

function startInitialization(load: WorkspaceLiffSdkLoader, liffId: string, options: WorkspaceLiffInitOptions): Initialization {
  let loaded: WorkspaceLiffSdk | null = null;
  const promise = load().then((sdk) => {
    // The SDK is one module per document: if another LIFF app (the Account page) initialized it here,
    // never re-initialize it with the Workspace ID.
    if (sdk.id !== null && sdk.id !== undefined && sdk.id !== liffId) throw otherLiffApp;
    try {
      options.onSdkLoaded?.(sdk);
    } catch {
      // Presentation bookkeeping only; initialization continues.
    }
    loaded = sdk;
    return sdk.init({ liffId, withLoginOnExternalBrowser: false });
  });
  const created: Initialization = { liffId, promise, state: "PENDING", sdk: null };
  promise.then(() => {
    if (initialization === created) {
      created.sdk = loaded;
      created.state = "READY";
    }
  }, () => {
    if (initialization === created) initialization = null;
  });
  return created;
}

/**
 * Single-flight, bounded `liff.init()`. With `liff.state` the SDK replaces the
 * location itself and the promise never settles, so the timeout only matters
 * when LINE does not respond. External browsers are never sent to LINE Login:
 * LINE identity is not DEMI authentication.
 */
export async function initializeWorkspaceLiff(
  load: WorkspaceLiffSdkLoader,
  liffId: string,
  options: WorkspaceLiffInitOptions = {},
): Promise<"READY" | "INIT_FAILED" | "OTHER_LIFF_APP"> {
  // Never initialize a second LIFF identity in a document that already holds one.
  if (initialization && initialization.liffId !== liffId) return "INIT_FAILED";
  if (initialization?.state === "TIMED_OUT") return "INIT_FAILED";
  if (initialization?.state === "READY") return "READY";
  const attempt = initialization ?? startInitialization(load, liffId, options);
  initialization = attempt;
  const timedOut = new Error("LIFF initialization timed out");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([attempt.promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(timedOut), options.timeoutMs ?? WORKSPACE_LIFF_INIT_TIMEOUT_MS);
    })]);
    return "READY";
  } catch (error: unknown) {
    if (error === otherLiffApp) return "OTHER_LIFF_APP";
    // A rejected SDK attempt clears itself; only a still-running one is marked so it is never raced.
    if (error === timedOut && initialization === attempt && attempt.state === "PENDING") attempt.state = "TIMED_OUT";
    return "INIT_FAILED";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test seam only. */
export function resetWorkspaceLiffInitializationForTests(): void {
  initialization = null;
  documentContinuation = null;
  reachabilityRefreshAttempted = false;
}

const ENTRY_ATTEMPTS_KEY = "demi.line.workspace.entryAttempts";
export const WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS = 4;
export const WORKSPACE_LIFF_ENTRY_WINDOW_MS = 60_000;

type AttemptStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readAttempts(store: AttemptStore, now: number): number[] {
  try {
    const value: unknown = JSON.parse(store.getItem(ENTRY_ATTEMPTS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is number => typeof item === "number" && item <= now && now - item < WORKSPACE_LIFF_ENTRY_WINDOW_MS)
      : [];
  } catch {
    return [];
  }
}

/**
 * Non-authoritative redirect-loop latch. A LINE login round trip that keeps
 * returning to `/` stops after a bounded number of attempts instead of looping.
 * Clearing storage can only allow another attempt, never access.
 */
export function recordWorkspaceLiffEntryAttempt(store: AttemptStore | null, now = Date.now()): "PROCEED" | "LOOP_STOPPED" {
  if (!store) return "PROCEED";
  const attempts = readAttempts(store, now);
  if (attempts.length >= WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS) return "LOOP_STOPPED";
  try {
    store.setItem(ENTRY_ATTEMPTS_KEY, JSON.stringify([...attempts, now]));
  } catch {
    // Storage may be unavailable; the bounded init timeout still applies.
  }
  return "PROCEED";
}

/**
 * One Workspace LIFF entry attempt: the loop latch applies only to LINE Login
 * returns (the only entry that can come back to `/`), then a bounded init.
 */
export async function startWorkspaceLiffEntry(
  load: WorkspaceLiffSdkLoader,
  liffId: string,
  store: AttemptStore | null,
  lineLoginReturn: boolean,
  options: WorkspaceLiffInitOptions = {},
): Promise<"READY" | "INIT_FAILED" | "LOOP_STOPPED" | "OTHER_LIFF_APP"> {
  // A remount joining this document's initialization is not a new LINE Login round trip.
  if (lineLoginReturn && !hasWorkspaceLiffInitialization(liffId) && recordWorkspaceLiffEntryAttempt(store) === "LOOP_STOPPED") {
    return "LOOP_STOPPED";
  }
  return initializeWorkspaceLiff(load, liffId, options);
}

/** LINE Login returns to the redirect URI LIFF built, marked by these parameters. */
export function isLineLoginReturnSearch(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return parameters.has("liffClientId") || parameters.has("code");
}

export function sessionAttemptStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function clearWorkspaceLiffEntryAttempts(store: AttemptStore | null): void {
  try {
    store?.removeItem(ENTRY_ATTEMPTS_KEY);
  } catch {
    // Nothing to clear.
  }
}

const CONTINUATION_ATTEMPTS_KEY = "demi.line.workspace.continuationAttempts";
export const PROTECTED_CONTINUATION_MAX_ATTEMPTS = 3;
export const PROTECTED_CONTINUATION_WINDOW_MS = 60_000;

/**
 * Non-authoritative reload-loop latch for the document gate. When the protected
 * RSC request fails, Next.js falls back to a same-URL document load; a failure
 * that persists would otherwise reload (and re-initialize LIFF) without end.
 * Attempts count per exact path and query and are cleared once a protected or
 * login tree renders. Clearing storage can only allow another attempt, never access.
 */
export function recordProtectedContinuationAttempt(store: AttemptStore | null, target: string, now = Date.now()): "PROCEED" | "LOOP_STOPPED" {
  if (!store) return "PROCEED";
  let attempts: number[] = [];
  try {
    const value: unknown = JSON.parse(store.getItem(CONTINUATION_ATTEMPTS_KEY) ?? "null");
    if (typeof value === "object" && value !== null && (value as { target?: unknown }).target === target) {
      const stored = (value as { attempts?: unknown }).attempts;
      attempts = Array.isArray(stored)
        ? stored.filter((item): item is number => typeof item === "number" && item <= now && now - item < PROTECTED_CONTINUATION_WINDOW_MS)
        : [];
    }
  } catch {
    attempts = [];
  }
  if (attempts.length >= PROTECTED_CONTINUATION_MAX_ATTEMPTS) return "LOOP_STOPPED";
  try {
    store.setItem(CONTINUATION_ATTEMPTS_KEY, JSON.stringify({ target, attempts: [...attempts, now] }));
  } catch {
    // Storage may be unavailable; continuation still proceeds.
  }
  return "PROCEED";
}

/** This document's one continuation decision; effect re-runs (StrictMode) reuse it. */
let documentContinuation: "PROCEED" | "LOOP_STOPPED" | null = null;

export function decideDocumentProtectedContinuation(store: AttemptStore | null, target: string): "PROCEED" | "LOOP_STOPPED" {
  documentContinuation ??= recordProtectedContinuationAttempt(store, target);
  return documentContinuation;
}

export function clearProtectedContinuationAttempts(store: AttemptStore | null): void {
  try {
    store?.removeItem(CONTINUATION_ATTEMPTS_KEY);
  } catch {
    // Nothing to clear.
  }
}

const REACHABILITY_REFRESH_KEY = "demi.line.workspace.reachabilityRefreshSent";
export const WORKSPACE_LIFF_REACHABILITY_REFRESH_PATH = "/api/line/account/reachability/refresh";
const REACHABILITY_REFRESH_TIMEOUT_MS = 25_000;

function readLiffToken(read: (() => string | null) | undefined): string | null {
  try {
    const token = read?.();
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** One attempt per document: set when a request starts and never cleared, so a failure retries on the next document load. */
let reachabilityRefreshAttempted = false;

function markReachabilityRefreshDone(store: AttemptStore): void {
  try {
    store.setItem(REACHABILITY_REFRESH_KEY, "1");
  } catch {
    // Storage unavailable: the next document may send once more; the server bounds repeats.
  }
}

/**
 * Fire-and-forget LINE friendship refresh for a READY Workspace entry inside the
 * LINE client. At most one request per document; the session flag is written only
 * after a 2xx response (REFRESHED, FRESH or NO_BINDING), so a failed attempt
 * (401, 429, 503, network, timeout) is retried by the next document in the same
 * session, never by a timer or loop. It never changes entry state or navigation:
 * the server re-verifies the DEMI session and the LINE identity, and every failure
 * is ignored. Without session storage nothing is sent.
 */
export function sendWorkspaceLiffReachabilityRefresh(
  sdk: WorkspaceLiffSdk,
  store: AttemptStore | null,
  fetcher: typeof fetch = fetch,
): void {
  try {
    if (reachabilityRefreshAttempted || !store || !sdk.isInClient()) return;
    const idToken = readLiffToken(sdk.getIDToken?.bind(sdk));
    const accessToken = readLiffToken(sdk.getAccessToken?.bind(sdk));
    if (!idToken || !accessToken) return;
    if (store.getItem(REACHABILITY_REFRESH_KEY) !== null) return;
    reachabilityRefreshAttempted = true;
    void fetcher(WORKSPACE_LIFF_REACHABILITY_REFRESH_PATH, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken, accessToken }),
      ...(typeof AbortSignal.timeout === "function" ? { signal: AbortSignal.timeout(REACHABILITY_REFRESH_TIMEOUT_MS) } : {}),
    }).then((response) => {
      if (response.ok) markReachabilityRefreshDone(store);
    }).catch(() => undefined);
  } catch {
    // Storage or SDK unavailable: the refresh is best effort and never affects entry.
  }
}
