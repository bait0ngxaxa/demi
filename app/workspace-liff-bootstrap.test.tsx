// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LIFF_BROWSER_CONTEXT_KEY } from "@/modules/line/domain/line-liff-browser";

import { resetWorkspaceLiffInitializationForTests, WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS, type WorkspaceLiffSdk } from "./workspace-liff-gateway";
import { WorkspaceLiffBootstrap } from "./workspace-liff-bootstrap";

/**
 * Mocked SDK lifecycle checks of DEMI's contract. They do not prove LINE
 * WebView behavior; real-device evidence lives in LINE_WORKSPACE_LIFF_UAT.
 */
const WORKSPACE_ID = "1234567890-Workspace";

let container: HTMLDivElement;
let root: Root;

function sdkDouble(init: () => Promise<void> = () => Promise.resolve()): WorkspaceLiffSdk & { init: ReturnType<typeof vi.fn> } {
  return { id: null, isInClient: () => true, init: vi.fn(init) };
}

async function mount(props: { liffId: string | null; sdk: WorkspaceLiffSdk }): Promise<ReturnType<typeof vi.fn>> {
  const load = vi.fn(async () => props.sdk);
  await act(async () => root.render(<WorkspaceLiffBootstrap liffId={props.liffId} load={load} />));
  await act(async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); });
  return load;
}

function navigationType(type: string): void {
  vi.spyOn(window.performance, "getEntriesByType").mockImplementation((entryType) =>
    entryType === "navigation" ? [{ type } as unknown as PerformanceEntry] : []);
}

function workspaceSession(): void {
  window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "WORKSPACE", mini: false, workspace: "PENDING" }));
}

function context(): { current: string; mini: boolean; workspace: string | null } | null {
  return JSON.parse(window.sessionStorage.getItem(LIFF_BROWSER_CONTEXT_KEY) ?? "null");
}

/** A new document: module state of the previous document is gone. */
function newDocument(): void {
  act(() => root.unmount());
  resetWorkspaceLiffInitializationForTests();
  root = createRoot(container);
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  resetWorkspaceLiffInitializationForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/app/personal/medications");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Workspace LIFF per-document initialization", () => {
  it("initializes the Workspace LIFF ID on the secondary-redirect document without changing the URL", async () => {
    workspaceSession();
    window.history.replaceState(null, "", "/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1");
    const sdk = sdkDouble();
    const load = await mount({ liffId: WORKSPACE_ID, sdk });
    expect(load).toHaveBeenCalledOnce();
    expect(sdk.init).toHaveBeenCalledWith({ liffId: WORKSPACE_ID, withLoginOnExternalBrowser: false });
    expect(`${window.location.pathname}${window.location.search}`).toBe("/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1");
    expect(container.innerHTML).toBe("");
  });

  it("never loads the SDK in an ordinary Chrome/Safari browser (no recorded LIFF entry)", async () => {
    const load = await mount({ liffId: WORKSPACE_ID, sdk: sdkDouble() });
    expect(load).not.toHaveBeenCalled();
  });

  it("never initializes the Workspace ID in a MINI App browser that navigated into /app", async () => {
    window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "MINI", mini: true, workspace: null }));
    const load = await mount({ liffId: WORKSPACE_ID, sdk: sdkDouble() });
    expect(load).not.toHaveBeenCalled();
  });

  it("does nothing when the Workspace LIFF is not configured instead of using another LIFF ID", async () => {
    workspaceSession();
    const load = await mount({ liffId: null, sdk: sdkDouble() });
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps one initialization across internal navigation re-renders and remounts of the same document", async () => {
    workspaceSession();
    const sdk = sdkDouble();
    await mount({ liffId: WORKSPACE_ID, sdk });
    await mount({ liffId: WORKSPACE_ID, sdk });
    act(() => root.unmount());
    root = createRoot(container);
    await mount({ liffId: WORKSPACE_ID, sdk });
    expect(sdk.init).toHaveBeenCalledOnce();
  });

  it("initializes again on a full-document navigation, reload or history restore that creates a new document", async () => {
    workspaceSession();
    const sdk = sdkDouble();
    await mount({ liffId: WORKSPACE_ID, sdk });
    newDocument();
    await mount({ liffId: WORKSPACE_ID, sdk });
    expect(sdk.init).toHaveBeenCalledTimes(2);
  });

  it("swallows an SDK rejection and lets the next document retry", async () => {
    workspaceSession();
    const failing = sdkDouble(() => Promise.reject(new Error("INIT_FAILED")));
    await mount({ liffId: WORKSPACE_ID, sdk: failing });
    const working = sdkDouble();
    await mount({ liffId: WORKSPACE_ID, sdk: working });
    expect(working.init).toHaveBeenCalledOnce();
  });

  it("after a timeout shows a Thai recovery notice, never races a second init in the same document, and retries in a new one", async () => {
    vi.useFakeTimers();
    workspaceSession();
    const stuck = sdkDouble(() => new Promise<void>(() => undefined));
    await mount({ liffId: WORKSPACE_ID, sdk: stuck });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
    expect(container.textContent).toContain("เชื่อมต่อกับ LINE ไม่สำเร็จ");
    expect(container.querySelector("button")?.textContent).toBe("ลองเชื่อมต่ออีกครั้ง");
    expect(context()?.workspace).toBe("FAILED");

    // Same document (remount): the still-running SDK work is not raced.
    act(() => root.unmount());
    root = createRoot(container);
    const working = sdkDouble();
    await mount({ liffId: WORKSPACE_ID, sdk: working });
    expect(working.init).not.toHaveBeenCalled();

    // The reload button starts a new document, which initializes again.
    newDocument();
    await mount({ liffId: WORKSPACE_ID, sdk: working });
    expect(working.init).toHaveBeenCalledOnce();
    expect(context()).toEqual({ current: "WORKSPACE", mini: false, workspace: "READY" });
    expect(container.textContent).toBe("");
  });

  it("records success so the Workspace counts as initialized only after liff.init() resolves", async () => {
    workspaceSession();
    let resolve: () => void = () => undefined;
    await mount({ liffId: WORKSPACE_ID, sdk: sdkDouble(() => new Promise<void>((done) => { resolve = done; })) });
    expect(context()?.workspace).toBe("PENDING");
    await act(async () => { resolve(); for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
    expect(context()?.workspace).toBe("READY");
  });

  it("records a rejection as FAILED and offers a manual reload, without automatic retries", async () => {
    workspaceSession();
    const failing = sdkDouble(() => Promise.reject(new Error("INIT_FAILED")));
    await mount({ liffId: WORKSPACE_ID, sdk: failing });
    expect(context()?.workspace).toBe("FAILED");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("คุณยังใช้ DEMI ได้ตามปกติ");
    await act(async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(failing.init).toHaveBeenCalledOnce();
  });

  it("still records the outcome when it unmounts during initialization (soft navigation to /login)", async () => {
    workspaceSession();
    let resolve: () => void = () => undefined;
    await mount({ liffId: WORKSPACE_ID, sdk: sdkDouble(() => new Promise<void>((done) => { resolve = done; })) });
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => { resolve(); for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
    expect(context()?.workspace).toBe("READY");
  });

  it.each(["back_forward", "reload"])("initializes a Workspace page reached by %s from the Account LIFF and makes Workspace current again", async (type) => {
    navigationType(type);
    window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "ACCOUNT", mini: false, workspace: "READY" }));
    const sdk = sdkDouble();
    await mount({ liffId: WORKSPACE_ID, sdk });
    expect(sdk.init).toHaveBeenCalledWith({ liffId: WORKSPACE_ID, withLoginOnExternalBrowser: false });
    expect(context()?.current).toBe("WORKSPACE");
  });

  it("does not initialize the Workspace ID on a plain new navigation from the Account LIFF into / or /app", async () => {
    navigationType("navigate");
    window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "ACCOUNT", mini: false, workspace: "READY" }));
    const load = await mount({ liffId: WORKSPACE_ID, sdk: sdkDouble() });
    expect(load).not.toHaveBeenCalled();
    expect(context()?.current).toBe("ACCOUNT");
  });

  it("never re-initializes an SDK the Account page already initialized in this document (soft navigation)", async () => {
    navigationType("reload");
    window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "ACCOUNT", mini: false, workspace: "READY" }));
    const accountOwned = { id: "1234567890-Account", isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    await mount({ liffId: WORKSPACE_ID, sdk: accountOwned });
    expect(accountOwned.init).not.toHaveBeenCalled();
    // Silent: not a Workspace failure, nothing recorded, no notice.
    expect(context()).toEqual({ current: "ACCOUNT", mini: false, workspace: "READY" });
    expect(container.textContent).toBe("");
  });

  it("re-asserts Workspace on a BFCache restore of an initialized page after an Account LIFF visit", async () => {
    workspaceSession();
    await mount({ liffId: WORKSPACE_ID, sdk: sdkDouble() });
    window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "ACCOUNT", mini: false, workspace: "READY" }));
    const restored = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => { window.dispatchEvent(restored); });
    expect(context()?.current).toBe("WORKSPACE");
  });

  it("does nothing when session storage is unavailable", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new Error("denied"); });
    const load = await mount({ liffId: WORKSPACE_ID, sdk: sdkDouble() });
    expect(load).not.toHaveBeenCalled();
  });

  it("stops a LINE Login round trip that keeps returning to /app instead of looping", async () => {
    workspaceSession();
    window.history.replaceState(null, "", "/app/personal?liff.hback=2&code=synthetic&liffClientId=1234567890");
    const sdk = sdkDouble(() => new Promise<void>(() => undefined));
    for (let attempt = 0; attempt < WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS + 2; attempt += 1) {
      newDocument();
      await mount({ liffId: WORKSPACE_ID, sdk });
    }
    expect(sdk.init).toHaveBeenCalledTimes(WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS);
  });
});
