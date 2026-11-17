// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markWorkspaceLiffHistoryEntry, prepareWorkspaceLiffHandoff } from "@/components/line/workspace-liff-document";
import { WorkspaceLiffBootstrap } from "./workspace-liff-bootstrap";
import { resetWorkspaceLiffInitializationForTests } from "./workspace-liff-gateway";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
const ID = "1234567890-Workspace";
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetWorkspaceLiffInitializationForTests();
  mocks.refresh.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("Workspace document navigation gate", () => {
  it("preserves ownership across an SDK-owned LINE Login round trip before init resolves", async () => {
    vi.useFakeTimers();
    prepareWorkspaceLiffHandoff(ID, "/app/personal/medications");
    const firstInit = vi.fn(() => new Promise<void>(() => undefined));
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={async () => ({ id: null, isInClient: () => true, init: firstInit })} />));
    expect(firstInit).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
    // SDK navigated to LINE Login; the callback opens a new document, not a React remount.
    act(() => root.unmount());
    resetWorkspaceLiffInitializationForTests();
    window.history.replaceState(null, "", "/app/personal/medications?liff.hback=2&code=synthetic&liffClientId=1234567890");
    root = createRoot(container);
    const secondInit = vi.fn(async () => undefined);
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={async () => ({ id: null, isInClient: () => true, init: secondInit })} />));
    expect(secondInit).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem("demi.line.workspace.handoff")).toBeNull();
  });

  it("clears a rejected SDK's return handoff instead of leaving historical ownership", async () => {
    prepareWorkspaceLiffHandoff(ID, "/app/personal/medications");
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={async () => ({
      id: null, isInClient: () => true, init: async () => { throw new Error("Provider rejected initialization"); },
    })} />));
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("demi.line.workspace.handoff")).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("keeps an unresolved SDK on an explicit recovery screen, without navigation", async () => {
    vi.useFakeTimers();
    prepareWorkspaceLiffHandoff(ID, "/app/personal/medications");
    const init = vi.fn(() => new Promise<void>(() => undefined));
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={async () => ({ id: null, isInClient: () => true, init })} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_001); });
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(container.querySelector("a,button")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(init).toHaveBeenCalledOnce();
  });

  it("ordinary and Account historical contexts do not load Workspace SDK", async () => {
    window.history.replaceState(null, "", "/app/personal/medications");
    const load = vi.fn();
    window.sessionStorage.setItem("demi.line.liff.context", JSON.stringify({ current: "ACCOUNT", workspace: "READY" }));
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={load} />));
    expect(load).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not discard an unowned LINE callback after handoff expiry or storage loss", async () => {
    window.history.replaceState(null, "", "/app/personal/medications?code=synthetic&liffClientId=1234567890");
    const load = vi.fn();
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={load} />));
    expect(load).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(window.location.search).toContain("code=synthetic");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("stops a persistent continuation reload before another SDK init or RSC request", async () => {
    const url = "/app/patients/assigned?task=screening&liff.hback=2&lineAppVersion=14.19.1";
    window.history.replaceState(null, "", url);
    markWorkspaceLiffHistoryEntry(ID);
    const now = Date.now();
    window.sessionStorage.setItem("demi.line.workspace.continuationAttempts", JSON.stringify({ target: url, attempts: [now - 3, now - 2, now - 1] }));
    prepareWorkspaceLiffHandoff(ID, "/app/patients/assigned?task=screening");
    const load = vi.fn();
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={load} />));
    expect(load).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.querySelector("h1")?.textContent).toBe("เชื่อมต่อ DEMI ไม่สำเร็จ");
    expect(container.querySelector("a,button")).toBeNull();
    expect(window.sessionStorage.getItem("demi.line.workspace.handoff")).toBeNull();
    expect(window.location.pathname + window.location.search).toBe(url);
  });

  it("counts one continuation attempt per document, not per StrictMode effect re-run", async () => {
    window.history.replaceState(null, "", "/app/personal/medications");
    await act(async () => root.render(<StrictMode><WorkspaceLiffBootstrap liffId={ID} load={vi.fn()} /></StrictMode>));
    const stored = JSON.parse(window.sessionStorage.getItem("demi.line.workspace.continuationAttempts") ?? "null");
    expect(stored).toMatchObject({ target: "/app/personal/medications" });
    expect(stored.attempts).toHaveLength(1);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

describe("Workspace LIFF background reachability refresh", () => {
  const tokens = { getIDToken: () => "synthetic-id-token-0000000000", getAccessToken: () => "synthetic-access-token-0000000000" };
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function enter(sdk: Record<string, unknown>): Promise<void> {
    prepareWorkspaceLiffHandoff(ID, "/app/personal/medications");
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={async () => ({ id: null, isInClient: () => true, init: async () => undefined, ...sdk })} />));
  }

  function remountNewDocument(): void {
    act(() => root.unmount());
    resetWorkspaceLiffInitializationForTests();
    root = createRoot(container);
  }

  const FLAG = "demi.line.workspace.reachabilityRefreshSent";
  const settle = async (): Promise<void> => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

  it("sends one refresh after READY inside the LINE client and, after a 2xx, not again in the same session", async () => {
    await enter(tokens);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    await settle();
    expect(window.sessionStorage.getItem(FLAG)).toBe("1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/line/account/reachability/refresh");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(String(init.body))).toEqual({ idToken: "synthetic-id-token-0000000000", accessToken: "synthetic-access-token-0000000000" });
    remountNewDocument();
    await enter(tokens);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["401 (signed out)", () => Promise.resolve(new Response(null, { status: 401 }))],
    ["429 (rate limited)", () => Promise.resolve(new Response(null, { status: 429 }))],
    ["503 (LINE unavailable)", () => Promise.resolve(new Response(null, { status: 503 }))],
    ["a rejected fetch", () => Promise.reject(new TypeError("network down"))],
    ["a timeout", () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))],
  ])("does not mark the session done after %s, so the next document in the session sends again", async (_label, fail) => {
    fetchMock.mockImplementationOnce(fail);
    await enter(tokens);
    await settle();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem(FLAG)).toBeNull();
    expect(container.querySelector("h1")?.textContent ?? "").not.toBe("เชื่อมต่อ DEMI ไม่สำเร็จ");
    remountNewDocument();
    await enter(tokens);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem(FLAG)).toBe("1");
  });

  it("sends once for a StrictMode effect re-run joining the same initialization", async () => {
    prepareWorkspaceLiffHandoff(ID, "/app/personal/medications");
    await act(async () => root.render(<StrictMode><WorkspaceLiffBootstrap liffId={ID} load={async () => ({ id: null, isInClient: () => true, init: async () => undefined, ...tokens })} /></StrictMode>));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not send for an ordinary web document", async () => {
    window.history.replaceState(null, "", "/app/personal/medications");
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={vi.fn()} />));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send outside the LINE client", async () => {
    await enter({ ...tokens, isInClient: () => false });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["ID token", { ...tokens, getIDToken: () => null }],
    ["access token", { ...tokens, getAccessToken: () => null }],
    ["token accessor", { getIDToken: () => { throw new Error("not initialized"); }, getAccessToken: tokens.getAccessToken }],
  ])("does not send without an %s", async (_label, sdk) => {
    await enter(sdk);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a rejected or signed-out refresh without changing the rendered state", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    await enter(tokens);
    const rendered = container.innerHTML;
    await act(async () => { await Promise.resolve(); });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.innerHTML).toBe(rendered);
    expect(container.querySelector("h1")?.textContent ?? "").not.toBe("เชื่อมต่อ DEMI ไม่สำเร็จ");
  });

  it("requests navigation before the refresh fetch settles", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    await enter(tokens);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0] ?? 0);
  });
});
