/*
 * Browser-side Workspace LIFF entry steps. They decide transport only (whether
 * to let the LIFF SDK consume its redirect and where to continue); DEMI
 * authentication and every authorization decision stay on the server.
 */

export type WorkspaceLiffSdk = {
  init(config: { liffId: string; withLoginOnExternalBrowser?: boolean }): Promise<void>;
};

export type WorkspaceLiffSdkLoader = () => Promise<WorkspaceLiffSdk>;

export const WORKSPACE_LIFF_INIT_TIMEOUT_MS = 10_000;

let pendingInitialization: { liffId: string; promise: Promise<void> } | null = null;

/**
 * Single-flight `liff.init()` with a bounded wait. With `liff.state` the SDK
 * replaces the location itself and the promise never settles, so the timeout
 * only matters when LINE does not respond. External browsers are never sent to
 * LINE Login: LINE identity is not DEMI authentication.
 */
export async function initializeWorkspaceLiff(
  load: WorkspaceLiffSdkLoader,
  liffId: string,
  timeoutMs = WORKSPACE_LIFF_INIT_TIMEOUT_MS,
): Promise<"READY" | "INIT_FAILED"> {
  let current = pendingInitialization;
  if (current?.liffId !== liffId) {
    const promise = load().then((sdk) => sdk.init({ liffId, withLoginOnExternalBrowser: false }));
    current = { liffId, promise };
    pendingInitialization = current;
    void promise.catch(() => {
      if (pendingInitialization?.promise === promise) pendingInitialization = null;
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([current.promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("LIFF initialization timed out")), timeoutMs);
    })]);
    return "READY";
  } catch {
    return "INIT_FAILED";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test seam only. */
export function resetWorkspaceLiffInitializationForTests(): void {
  pendingInitialization = null;
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
): Promise<"READY" | "INIT_FAILED" | "LOOP_STOPPED"> {
  if (lineLoginReturn && recordWorkspaceLiffEntryAttempt(store) === "LOOP_STOPPED") return "LOOP_STOPPED";
  return initializeWorkspaceLiff(load, liffId);
}

export function clearWorkspaceLiffEntryAttempts(store: AttemptStore | null): void {
  try {
    store?.removeItem(ENTRY_ATTEMPTS_KEY);
  } catch {
    // Nothing to clear.
  }
}
