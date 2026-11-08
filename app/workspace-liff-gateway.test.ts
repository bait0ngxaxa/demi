import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearWorkspaceLiffEntryAttempts,
  initializeWorkspaceLiff,
  recordWorkspaceLiffEntryAttempt,
  resetWorkspaceLiffInitializationForTests,
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
    const sdk: WorkspaceLiffSdk = { init: vi.fn().mockResolvedValue(undefined) };
    await expect(initializeWorkspaceLiff(async () => sdk, "1234567890-Workspace")).resolves.toBe("READY");
    expect(sdk.init).toHaveBeenCalledWith({ liffId: "1234567890-Workspace", withLoginOnExternalBrowser: false });
  });

  it("shares one in-flight initialization between concurrent callers", async () => {
    let resolve: () => void = () => undefined;
    const sdk: WorkspaceLiffSdk = { init: vi.fn(() => new Promise<void>((done) => { resolve = done; })) };
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
    const failing: WorkspaceLiffSdk = { init: vi.fn().mockRejectedValue(new Error("INIT_FAILED")) };
    await expect(initializeWorkspaceLiff(async () => failing, "1234567890-Workspace")).resolves.toBe("INIT_FAILED");
    await expect(initializeWorkspaceLiff(() => Promise.reject(new Error("chunk")), "1234567890-Workspace")).resolves.toBe("INIT_FAILED");

    const working: WorkspaceLiffSdk = { init: vi.fn().mockResolvedValue(undefined) };
    await expect(initializeWorkspaceLiff(async () => working, "1234567890-Workspace")).resolves.toBe("READY");
    expect(working.init).toHaveBeenCalledOnce();
  });

  it("bounds an initialization that neither redirects nor resolves", async () => {
    vi.useFakeTimers();
    const pending = initializeWorkspaceLiff(async () => ({ init: () => new Promise<void>(() => undefined) }), "1234567890-Workspace", 50);
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toBe("INIT_FAILED");
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
