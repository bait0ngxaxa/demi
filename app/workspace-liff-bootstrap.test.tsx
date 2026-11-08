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
  return { isInClient: () => true, init: vi.fn(init) };
}

async function mount(props: { liffId: string | null; sdk: WorkspaceLiffSdk }): Promise<ReturnType<typeof vi.fn>> {
  const load = vi.fn(async () => props.sdk);
  await act(async () => root.render(<WorkspaceLiffBootstrap liffId={props.liffId} load={load} />));
  await act(async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); });
  return load;
}

function workspaceSession(): void {
  window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "WORKSPACE", mini: false, workspace: "PENDING" }));
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

  it("retries after a timeout instead of awaiting the stale initialization", async () => {
    vi.useFakeTimers();
    workspaceSession();
    const stuck = sdkDouble(() => new Promise<void>(() => undefined));
    await mount({ liffId: WORKSPACE_ID, sdk: stuck });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
    act(() => root.unmount());
    root = createRoot(container);
    const working = sdkDouble();
    await mount({ liffId: WORKSPACE_ID, sdk: working });
    expect(working.init).toHaveBeenCalledOnce();
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
