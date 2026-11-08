/*
 * Browser-side Workspace LIFF entry steps. They decide transport only (whether
 * to let the LIFF SDK consume its redirect and where to continue); DEMI
 * authentication and every authorization decision stay on the server.
 */

export type WorkspaceLiffSdk = {
  init(config: { liffId: string; withLoginOnExternalBrowser?: boolean }): Promise<void>;
  /** Documented as callable before `liff.init()` resolves. */
  isInClient(): boolean;
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
type Initialization = { liffId: string; promise: Promise<void>; state: "PENDING" | "READY" | "TIMED_OUT" };
let initialization: Initialization | null = null;

export function hasWorkspaceLiffInitialization(liffId: string): boolean {
  return initialization?.liffId === liffId;
}

export type WorkspaceLiffInitOptions = {
  timeoutMs?: number;
  /** Runs once, after the SDK loads and before `liff.init()`; it must not change the URL. */
  onSdkLoaded?: (sdk: WorkspaceLiffSdk) => void;
};

function startInitialization(load: WorkspaceLiffSdkLoader, liffId: string, options: WorkspaceLiffInitOptions): Initialization {
  const promise = load().then((sdk) => {
    try {
      options.onSdkLoaded?.(sdk);
    } catch {
      // Presentation bookkeeping only; initialization continues.
    }
    return sdk.init({ liffId, withLoginOnExternalBrowser: false });
  });
  const created: Initialization = { liffId, promise, state: "PENDING" };
  promise.then(() => {
    if (initialization === created) created.state = "READY";
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
): Promise<"READY" | "INIT_FAILED"> {
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
): Promise<"READY" | "INIT_FAILED" | "LOOP_STOPPED"> {
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
