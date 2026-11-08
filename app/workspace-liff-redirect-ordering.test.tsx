// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prepareWorkspaceLiffHandoff } from "@/components/line/workspace-liff-document";
import { WorkspaceLiffBootstrap } from "./workspace-liff-bootstrap";
import { resetWorkspaceLiffInitializationForTests, type WorkspaceLiffSdk } from "./workspace-liff-gateway";

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
  it("does not request the protected tree until both module loading and SDK initialization finish", async () => {
    const events: string[] = [];
    let deliver: (sdk: WorkspaceLiffSdk) => void = () => undefined;
    let complete: () => void = () => undefined;
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: () => {
      events.push(`init:${window.location.pathname}${window.location.search}`);
      return new Promise<void>((resolve) => { complete = resolve; });
    } };
    const load = () => new Promise<WorkspaceLiffSdk>((resolve) => { deliver = resolve; });
    prepareWorkspaceLiffHandoff(ID, "/app/personal/medications");
    await act(async () => root.render(<StrictMode><WorkspaceLiffBootstrap liffId={ID} load={load} /></StrictMode>));
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.querySelector("a,button,meta[http-equiv=refresh]")).toBeNull();
    await act(async () => { deliver(sdk); });
    expect(events).toEqual(["init:/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1"]);
    expect(mocks.refresh).not.toHaveBeenCalled();
    await act(async () => { complete(); });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe("/app/personal/medications");
  });

});
