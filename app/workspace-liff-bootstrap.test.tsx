// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prepareWorkspaceLiffHandoff } from "@/components/line/workspace-liff-document";
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
    const load = vi.fn();
    window.sessionStorage.setItem("demi.line.liff.context", JSON.stringify({ current: "ACCOUNT", mini: false, workspace: "READY" }));
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={ID} load={load} />));
    expect(load).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
