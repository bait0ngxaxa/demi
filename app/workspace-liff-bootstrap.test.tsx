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

  it("ordinary, Account and MINI historical contexts do not load Workspace SDK", async () => {
    window.history.replaceState(null, "", "/app/personal/medications");
    const load = vi.fn();
    window.sessionStorage.setItem("demi.line.liff.context", JSON.stringify({ current: "ACCOUNT", mini: false, workspace: "READY" }));
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
