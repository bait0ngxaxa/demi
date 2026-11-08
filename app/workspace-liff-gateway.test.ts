import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearProtectedContinuationAttempts,
  clearWorkspaceLiffEntryAttempts,
  hasWorkspaceLiffInitialization,
  initializeWorkspaceLiff,
  isLineLoginReturnSearch,
  PROTECTED_CONTINUATION_MAX_ATTEMPTS,
  PROTECTED_CONTINUATION_WINDOW_MS,
  recordProtectedContinuationAttempt,
  recordWorkspaceLiffEntryAttempt,
  resetWorkspaceLiffInitializationForTests,
  startWorkspaceLiffEntry,
  WORKSPACE_LIFF_ENTRY_WINDOW_MS,
  WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS,
  type WorkspaceLiffSdk,
} from "./workspace-liff-gateway";

function memoryStore(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("Workspace LIFF initialization", () => {
  afterEach(() => {
    resetWorkspaceLiffInitializationForTests();
    vi.useRealTimers();
  });

  it("initializes the Workspace LIFF ID without forcing LINE Login in external browsers", async () => {
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    await expect(initializeWorkspaceLiff(async () => sdk, "1234567890-Workspace")).resolves.toBe("READY");
    expect(sdk.init).toHaveBeenCalledWith({ liffId: "1234567890-Workspace", withLoginOnExternalBrowser: false });
  });

  it("shares one in-flight initialization between concurrent callers", async () => {
    let resolve: () => void = () => undefined;
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>((done) => { resolve = done; })) };
    const load = vi.fn(async () => sdk);
    const first = initializeWorkspaceLiff(load, "1234567890-Workspace");
    const second = initializeWorkspaceLiff(load, "1234567890-Workspace");
    await Promise.resolve();
    await Promise.resolve();
    resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(["READY", "READY"]);
    expect(load).toHaveBeenCalledOnce();
    expect(sdk.init).toHaveBeenCalledOnce();
  });

  it("maps SDK or loader failure to a retryable state and allows a fresh retry", async () => {
    const failing: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockRejectedValue(new Error("INIT_FAILED")) };
    await expect(initializeWorkspaceLiff(async () => failing, "1234567890-Workspace")).resolves.toBe("INIT_FAILED");
    await expect(initializeWorkspaceLiff(() => Promise.reject(new Error("chunk")), "1234567890-Workspace")).resolves.toBe("INIT_FAILED");

    const working: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    await expect(initializeWorkspaceLiff(async () => working, "1234567890-Workspace")).resolves.toBe("READY");
    expect(working.init).toHaveBeenCalledOnce();
  });

  it("bounds an initialization that neither redirects nor resolves", async () => {
    vi.useFakeTimers();
    const pending = initializeWorkspaceLiff(async () => ({ id: null, isInClient: () => true, init: () => new Promise<void>(() => undefined) }), "1234567890-Workspace", { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toBe("INIT_FAILED");
  });

  it("never races a second liff.init() against one that timed out but is still running", async () => {
    vi.useFakeTimers();
    let rejectStuck: (error: Error) => void = () => undefined;
    const stuck: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>((_, reject) => { rejectStuck = reject; })) };
    const first = initializeWorkspaceLiff(async () => stuck, "1234567890-Workspace", { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    await expect(first).resolves.toBe("INIT_FAILED");

    const working: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    await expect(initializeWorkspaceLiff(async () => working, "1234567890-Workspace", { timeoutMs: 50 })).resolves.toBe("INIT_FAILED");
    expect(working.init).not.toHaveBeenCalled();

    // Once the SDK actually gives up, a fresh retry is allowed: the timeout never poisons the document.
    rejectStuck(new Error("INIT_FAILED"));
    await vi.advanceTimersByTimeAsync(0);
    expect(hasWorkspaceLiffInitialization("1234567890-Workspace")).toBe(false);
    await expect(initializeWorkspaceLiff(async () => working, "1234567890-Workspace", { timeoutMs: 50 })).resolves.toBe("READY");
    expect(working.init).toHaveBeenCalledOnce();
  });

  it("lets a late success after a timeout serve later callers without rewriting the result already returned", async () => {
    vi.useFakeTimers();
    let resolveLate: () => void = () => undefined;
    const late: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>((resolve) => { resolveLate = resolve; })) };
    const first = initializeWorkspaceLiff(async () => late, "1234567890-Workspace", { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    await expect(first).resolves.toBe("INIT_FAILED");
    resolveLate();
    await vi.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toBe("INIT_FAILED");
    await expect(initializeWorkspaceLiff(async () => late, "1234567890-Workspace")).resolves.toBe("READY");
    expect(late.init).toHaveBeenCalledOnce();
  });

  it("keeps a successful initialization for remounts and internal navigation without calling init again", async () => {
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    const load = vi.fn(async () => sdk);
    await expect(initializeWorkspaceLiff(load, "1234567890-Workspace")).resolves.toBe("READY");
    await expect(initializeWorkspaceLiff(load, "1234567890-Workspace")).resolves.toBe("READY");
    expect(load).toHaveBeenCalledOnce();
    expect(sdk.init).toHaveBeenCalledOnce();
  });

  it("refuses to initialize an SDK another LIFF app already initialized in this document (liff.id)", async () => {
    const sdk = { id: "1234567890-Account", isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    await expect(initializeWorkspaceLiff(async () => sdk, "1234567890-Workspace")).resolves.toBe("OTHER_LIFF_APP");
    expect(sdk.init).not.toHaveBeenCalled();
    // An SDK already initialized with the Workspace ID is fine.
    const own = { id: "1234567890-Workspace", isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    await expect(initializeWorkspaceLiff(async () => own, "1234567890-Workspace")).resolves.toBe("READY");
  });

  it("never initializes a second LIFF identity in the same document", async () => {
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    await initializeWorkspaceLiff(async () => sdk, "1234567890-Workspace");
    await expect(initializeWorkspaceLiff(async () => sdk, "1234567890-Account")).resolves.toBe("INIT_FAILED");
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith({ liffId: "1234567890-Workspace", withLoginOnExternalBrowser: false });
  });

  it("runs the SDK-loaded hook before init and tolerates its failure", async () => {
    const order: string[] = [];
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(async () => { order.push("init"); }) };
    await expect(initializeWorkspaceLiff(async () => sdk, "1234567890-Workspace", {
      onSdkLoaded: () => { order.push("loaded"); throw new Error("storage denied"); },
    })).resolves.toBe("READY");
    expect(order).toEqual(["loaded", "init"]);
  });

  it("counts a LINE Login return once even when the entry remounts while init is in flight", async () => {
    const store = memoryStore();
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>(() => undefined)) };
    void startWorkspaceLiffEntry(async () => sdk, "1234567890-Workspace", store, true);
    void startWorkspaceLiffEntry(async () => sdk, "1234567890-Workspace", store, true);
    await Promise.resolve();
    expect(JSON.parse(store.getItem("demi.line.workspace.entryAttempts") ?? "[]")).toHaveLength(1);
  });

  it("recognizes LINE Login return markers", () => {
    expect(isLineLoginReturnSearch("?liff.hback=2&code=x&liffClientId=1")).toBe(true);
    expect(isLineLoginReturnSearch("?liff.state=%2Fapp")).toBe(false);
    expect(isLineLoginReturnSearch("")).toBe(false);
  });
});

describe("Workspace LIFF redirect-loop latch", () => {
  it("stops after a bounded number of LINE login returns within the window", () => {
    const store = memoryStore();
    const now = 1_700_000_000_000;
    for (let attempt = 0; attempt < WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS; attempt += 1) {
      expect(recordWorkspaceLiffEntryAttempt(store, now + attempt)).toBe("PROCEED");
    }
    expect(recordWorkspaceLiffEntryAttempt(store, now + 10)).toBe("LOOP_STOPPED");
    expect(recordWorkspaceLiffEntryAttempt(store, now + WORKSPACE_LIFF_ENTRY_WINDOW_MS + 10)).toBe("PROCEED");
  });

  it("is cleared after a completed entry and tolerates unavailable or corrupted storage", () => {
    const store = memoryStore();
    for (let attempt = 0; attempt < WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS; attempt += 1) recordWorkspaceLiffEntryAttempt(store, 1000 + attempt);
    clearWorkspaceLiffEntryAttempts(store);
    expect(recordWorkspaceLiffEntryAttempt(store, 1010)).toBe("PROCEED");

    store.setItem("demi.line.workspace.entryAttempts", "{not json");
    expect(recordWorkspaceLiffEntryAttempt(store, 1020)).toBe("PROCEED");
    expect(recordWorkspaceLiffEntryAttempt(null)).toBe("PROCEED");
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(recordWorkspaceLiffEntryAttempt(throwing)).toBe("PROCEED");
    expect(() => clearWorkspaceLiffEntryAttempts(throwing)).not.toThrow();
  });
});

describe("protected continuation reload latch", () => {
  const target = "/app/patients/assigned?task=screening&liff.hback=2";

  it("stops a persistent same-URL reload loop and reopens after the window", () => {
    const store = memoryStore();
    for (let attempt = 0; attempt < PROTECTED_CONTINUATION_MAX_ATTEMPTS; attempt += 1) {
      expect(recordProtectedContinuationAttempt(store, target, 1000 + attempt)).toBe("PROCEED");
    }
    expect(recordProtectedContinuationAttempt(store, target, 1010)).toBe("LOOP_STOPPED");
    expect(recordProtectedContinuationAttempt(store, target, 1000 + PROTECTED_CONTINUATION_WINDOW_MS + 10)).toBe("PROCEED");
  });

  it("counts only the exact path and query, and a rendered tree clears it", () => {
    const store = memoryStore();
    for (let attempt = 0; attempt < PROTECTED_CONTINUATION_MAX_ATTEMPTS; attempt += 1) recordProtectedContinuationAttempt(store, target, 1000 + attempt);
    expect(recordProtectedContinuationAttempt(store, "/app/patients/assigned?task=screening", 1010)).toBe("PROCEED");
    for (let attempt = 0; attempt < PROTECTED_CONTINUATION_MAX_ATTEMPTS; attempt += 1) recordProtectedContinuationAttempt(store, target, 2000 + attempt);
    clearProtectedContinuationAttempts(store);
    expect(recordProtectedContinuationAttempt(store, target, 2010)).toBe("PROCEED");
  });

  it("never blocks on unavailable or corrupted storage", () => {
    const store = memoryStore();
    store.setItem("demi.line.workspace.continuationAttempts", "{not json");
    expect(recordProtectedContinuationAttempt(store, target, 1000)).toBe("PROCEED");
    store.setItem("demi.line.workspace.continuationAttempts", JSON.stringify({ target, attempts: "many" }));
    expect(recordProtectedContinuationAttempt(store, target, 1000)).toBe("PROCEED");
    expect(recordProtectedContinuationAttempt(null, target)).toBe("PROCEED");
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(recordProtectedContinuationAttempt(throwing, target)).toBe("PROCEED");
    expect(() => clearProtectedContinuationAttempts(throwing)).not.toThrow();
  });
});
