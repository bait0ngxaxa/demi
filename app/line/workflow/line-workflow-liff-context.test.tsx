// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LIFF_BROWSER_CONTEXT_KEY } from "@/modules/line/domain/line-liff-browser";

const mocks = vi.hoisted(() => ({
  isInClient: vi.fn(() => true),
  initialize: vi.fn(async () => "READY"),
  verify: vi.fn(async () => "LOGIN_REQUIRED"),
}));

vi.mock("@line/liff", () => ({ default: { isInClient: mocks.isInClient, login: vi.fn() } }));
vi.mock("./line-workflow-gateway", async (importOriginal) => ({
  ...await importOriginal<typeof import("./line-workflow-gateway")>(),
  initializeLineWorkflowLiff: mocks.initialize,
  verifyLineWorkflow: mocks.verify,
}));

import { WorkspaceLiffEntryScreen } from "../../workspace-liff-entry";
import { LineWorkflowScreen } from "./line-workflow-client";
import { SLOW_LOADING_HINT } from "@/components/line/use-slow-loading-hint";

import { LineWorkflowClient } from "./line-workflow-client";

/** MINI isolation of the LIFF browser context (mocked SDK). MINI verification itself is unchanged. */
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.isInClient.mockReturnValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(): Promise<void> {
  await act(async () => root.render(
    <LineWorkflowClient status="READY" liffId="2000000001-MiniDev" loginHref="/login" lineLoginRedirectUri="https://demi.example.org/line/workflow" />,
  ));
  await act(async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
}

describe("MINI App LIFF browser context", () => {
  it("marks the session as MINI so Account/Workspace links keep the approved ordinary web exits", async () => {
    window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "WORKSPACE", mini: false, workspace: "READY" }));
    await mount();
    expect(mocks.initialize).toHaveBeenCalledWith(expect.anything(), "2000000001-MiniDev");
    expect(JSON.parse(window.sessionStorage.getItem(LIFF_BROWSER_CONTEXT_KEY) ?? "null")).toEqual({ current: "MINI", mini: true, workspace: "READY" });
    expect(mocks.verify).toHaveBeenCalledOnce();
  });

  it("records nothing outside the LIFF browser", async () => {
    mocks.isInClient.mockReturnValue(false);
    await mount();
    expect(window.sessionStorage.getItem(LIFF_BROWSER_CONTEXT_KEY)).toBeNull();
  });
});


describe("LINE waiting screen progress", () => {
  it.each(["workspace", "workflow"])("resets the %s slow hint on stage changes and cleans up on unmount", (screen) => {
    vi.useFakeTimers();
    const render = (stage: "initial" | "next" | "error"): void => {
      act(() => root.render(screen === "workspace"
        ? <WorkspaceLiffEntryScreen state={stage === "initial" ? "INITIALIZING" : stage === "next" ? "REDIRECTING" : "INIT_FAILED"} />
        : <LineWorkflowScreen state={stage === "initial" ? "INITIALIZING" : stage === "next" ? "VERIFYING" : "INIT_FAILED"} loginHref="/login" />));
    };
    try {
      render("initial");
      expect(container.querySelector(".motion-safe\\:animate-spin")).not.toBeNull();
      act(() => vi.advanceTimersByTime(4999));
      expect(container.textContent).not.toContain(SLOW_LOADING_HINT);
      act(() => vi.advanceTimersByTime(1));
      expect(container.textContent).toContain(SLOW_LOADING_HINT);
      render("next");
      expect(container.textContent).not.toContain(SLOW_LOADING_HINT);
      act(() => vi.advanceTimersByTime(5000));
      expect(container.textContent).toContain(SLOW_LOADING_HINT);
      render("error");
      expect(container.textContent).not.toContain(SLOW_LOADING_HINT);
      expect(container.querySelector(".motion-safe\\:animate-spin")).toBeNull();
      render("initial");
      act(() => root.render(null));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("renders the granted-scope waiting spinner", () => {
    act(() => root.render(<LineWorkflowScreen state="SCOPE_GRANTED" loginHref="/login" />));
    expect(container.querySelector("[aria-hidden=true]")).not.toBeNull();
  });
});
