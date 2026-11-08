import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  setState: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { mocks.effects.push(effect); },
  useState: (initial: unknown) => [initial, mocks.setState],
}));

import { WorkspaceLiffEntry, WorkspaceLiffEntryScreen, type WorkspaceLiffEntryMode } from "./workspace-liff-entry";
import { resetWorkspaceLiffInitializationForTests, type WorkspaceLiffSdk } from "./workspace-liff-gateway";

type BrowserDouble = {
  location: { hash: string; search: string; replace: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> };
  history: { replaceState: ReturnType<typeof vi.fn> };
  sessionStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

let browser: BrowserDouble;

function stubBrowser(url: { hash?: string; search?: string } = {}): void {
  const values = new Map<string, string>();
  browser = {
    location: { hash: url.hash ?? "", search: url.search ?? "", replace: vi.fn(), reload: vi.fn() },
    history: { replaceState: vi.fn() },
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("window", browser);
}

function mount(props: {
  mode: WorkspaceLiffEntryMode;
  liffId?: string | null;
  destination?: string | null;
  fallbackHref?: string;
  sdk?: WorkspaceLiffSdk;
}): { load: ReturnType<typeof vi.fn> } {
  mocks.effects.length = 0;
  const fallbackSdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
  const load = vi.fn(async () => props.sdk ?? fallbackSdk);
  WorkspaceLiffEntry({
    mode: props.mode,
    liffId: props.liffId === undefined ? "1234567890-Workspace" : props.liffId,
    destination: props.destination ?? null,
    fallbackHref: props.fallbackHref ?? "/app",
    load,
  });
  for (const effect of mocks.effects) effect();
  return { load };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("Workspace LIFF root entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceLiffInitializationForTests();
    stubBrowser();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("continues an ordinary browser to the server-decided web destination without loading LIFF", () => {
    const { load } = mount({ mode: "ORDINARY", fallbackHref: "/login" });
    expect(browser.location.replace).toHaveBeenCalledWith("/login");
    expect(load).not.toHaveBeenCalled();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
  });

  it("initializes LIFF before any URL change on a deep-link primary redirect and lets the SDK redirect", async () => {
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>(() => undefined)) };
    const { load } = mount({ mode: "LIFF", destination: "/app/personal/wellness", sdk });
    await settle();
    expect(load).toHaveBeenCalledOnce();
    expect(sdk.init).toHaveBeenCalledWith({ liffId: "1234567890-Workspace", withLoginOnExternalBrowser: false });
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    expect(browser.location.replace).not.toHaveBeenCalled();
  });

  it("leaves Android and LIFF-to-LIFF platform parameters untouched until the SDK consumes them", async () => {
    stubBrowser({ search: "?liff.state=%2Fapp%2Fpersonal&lineAppVersion=14.19.1&liff.referrer=https%3A%2F%2Fliff.line.me%2Fx&liff.hback=2" });
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>(() => undefined)) };
    mount({ mode: "LIFF", destination: "/app/personal", sdk });
    await settle();
    expect(sdk.init).toHaveBeenCalledOnce();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    expect(browser.location.replace).not.toHaveBeenCalled();
    expect(browser.location.search).toBe("?liff.state=%2Fapp%2Fpersonal&lineAppVersion=14.19.1&liff.referrer=https%3A%2F%2Fliff.line.me%2Fx&liff.hback=2");
  });

  it("marks the Workspace LIFF browser session before init only when the SDK reports the LIFF browser", async () => {
    const order: string[] = [];
    const sdk: WorkspaceLiffSdk = {
      id: null,
      isInClient: vi.fn(() => { order.push("isInClient"); return true; }),
      init: vi.fn(() => { order.push(`init:${browser.sessionStorage.getItem("demi.line.liff.context")}`); return new Promise<void>(() => undefined); }),
    };
    mount({ mode: "LIFF", destination: "/app", sdk });
    await settle();
    expect(order).toEqual(["isInClient", `init:${JSON.stringify({ current: "WORKSPACE", mini: false, workspace: "PENDING" })}`]);
    expect(browser.history.replaceState).not.toHaveBeenCalled();

    // A LIFF URL opened in Chrome/Safari: initialized, never marked.
    stubBrowser();
    resetWorkspaceLiffInitializationForTests();
    mount({ mode: "LIFF", destination: "/app", sdk: { id: null, isInClient: () => false, init: vi.fn().mockResolvedValue(undefined) } });
    await settle();
    expect(browser.sessionStorage.getItem("demi.line.liff.context")).toBeNull();

    for (const props of [{ mode: "ORDINARY" as const }, { mode: "NAVIGATION_INVALID" as const }, { mode: "LIFF" as const, liffId: null }]) {
      stubBrowser();
      mount(props);
      await settle();
      expect(browser.sessionStorage.getItem("demi.line.liff.context")).toBeNull();
    }
  });

  it("treats a Workspace LIFF URL opened in a MINI browsing session as a real Workspace entry", async () => {
    browser.sessionStorage.setItem("demi.line.liff.context", JSON.stringify({ current: "MINI", mini: true, workspace: null }));
    mount({ mode: "LIFF", destination: "/app/personal", sdk: { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>(() => undefined)) } });
    await settle();
    expect(JSON.parse(browser.sessionStorage.getItem("demi.line.liff.context") ?? "null")).toEqual({ current: "WORKSPACE", mini: false, workspace: "PENDING" });
  });

  it("records the root init outcome so a failure never reads as an initialized Workspace", async () => {
    mount({ mode: "LIFF", destination: null, sdk: { id: null, isInClient: () => true, init: vi.fn().mockRejectedValue(new Error("INIT_FAILED")) } });
    await settle();
    expect(JSON.parse(browser.sessionStorage.getItem("demi.line.liff.context") ?? "null")).toEqual({ current: "WORKSPACE", mini: false, workspace: "FAILED" });

    stubBrowser({ hash: "#access_token=synthetic" });
    resetWorkspaceLiffInitializationForTests();
    mount({ mode: "ORDINARY", fallbackHref: "/app", sdk: { id: null, isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) } });
    await settle();
    expect(JSON.parse(browser.sessionStorage.getItem("demi.line.liff.context") ?? "null")).toEqual({ current: "WORKSPACE", mini: false, workspace: "READY" });
  });

  it("continues to the allowlisted destination when init resolves without a secondary redirect", async () => {
    mount({ mode: "LIFF", destination: "/app/patients/assigned?task=screening" });
    await settle();
    expect(browser.location.replace).toHaveBeenCalledWith("/app/patients/assigned?task=screening");
  });

  it("consumes bare-launch credentials from the fragment, then continues to the web destination", async () => {
    stubBrowser({ hash: "#access_token=synthetic&context_token=synthetic" });
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockResolvedValue(undefined) };
    mount({ mode: "ORDINARY", fallbackHref: "/app", sdk });
    await settle();
    expect(sdk.init).toHaveBeenCalledOnce();
    expect(browser.location.replace).toHaveBeenCalledWith("/app");
  });

  it("shows a retryable failure when init fails and keeps the user on the same entry", async () => {
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn().mockRejectedValue(new Error("INIT_FAILED")) };
    mount({ mode: "LIFF", destination: "/app/personal", sdk });
    await settle();
    expect(mocks.setState).toHaveBeenLastCalledWith("INIT_FAILED");
    expect(browser.location.replace).not.toHaveBeenCalled();
  });

  it("never initializes another LIFF identity when Workspace LIFF is not configured", async () => {
    stubBrowser({ search: "?liff.state=%2Fapp", hash: "#access_token=synthetic" });
    const { load } = mount({ mode: "LIFF", liffId: null, destination: "/app" });
    await settle();
    expect(load).not.toHaveBeenCalled();
    expect(browser.history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(browser.location.replace).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(WorkspaceLiffEntry({ mode: "LIFF", liffId: null, destination: "/app", fallbackHref: "/app" })))
      .toContain("ยังเปิด DEMI ผ่าน LINE ไม่ได้");
  });

  it("drops bare-launch credentials and continues on the web when Workspace LIFF is not configured", async () => {
    stubBrowser({ hash: "#access_token=synthetic" });
    const { load } = mount({ mode: "ORDINARY", liffId: null, fallbackHref: "/login" });
    await settle();
    expect(load).not.toHaveBeenCalled();
    expect(browser.history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(browser.location.replace).toHaveBeenCalledWith("/login");
  });

  it("rejects invalid navigation without SDK work and drops platform parameters", async () => {
    const { load } = mount({ mode: "NAVIGATION_INVALID" });
    await settle();
    expect(load).not.toHaveBeenCalled();
    expect(browser.history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(renderToStaticMarkup(WorkspaceLiffEntry({ mode: "NAVIGATION_INVALID", liffId: "1234567890-Workspace", destination: null, fallbackHref: "/app" })))
      .toContain("ลิงก์นี้ไม่ถูกต้อง");
  });

  it("stops a LINE login return loop instead of initializing again", async () => {
    stubBrowser({ search: "?liff.state=%2Fapp&code=synthetic&liffClientId=1234567890" });
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>(() => undefined)) };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      resetWorkspaceLiffInitializationForTests();
      mount({ mode: "LIFF", destination: "/app", sdk });
      await settle();
    }
    expect(sdk.init).toHaveBeenCalledTimes(4);
    resetWorkspaceLiffInitializationForTests();
    mount({ mode: "LIFF", destination: "/app", sdk });
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(4);
    expect(mocks.setState).toHaveBeenLastCalledWith("LOOP_STOPPED");
  });

  it("does not count ordinary primary redirects toward the loop latch", async () => {
    const sdk: WorkspaceLiffSdk = { id: null, isInClient: () => true, init: vi.fn(() => new Promise<void>(() => undefined)) };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      resetWorkspaceLiffInitializationForTests();
      mount({ mode: "LIFF", destination: "/app/personal", sdk });
      await settle();
    }
    expect(sdk.init).toHaveBeenCalledTimes(6);
  });

  it("reloads a BFCache-restored entry instead of resuming it", () => {
    mount({ mode: "LIFF", destination: "/app" });
    const handler = browser.addEventListener.mock.calls.find(([name]) => name === "pageshow")?.[1] as (event: { persisted: boolean }) => void;
    handler({ persisted: false });
    expect(browser.location.reload).not.toHaveBeenCalled();
    handler({ persisted: true });
    expect(browser.location.reload).toHaveBeenCalledOnce();
  });

  it("renders loading, failure and invalid states in Thai with a plain continue link", () => {
    const loading = renderToStaticMarkup(<WorkspaceLiffEntryScreen state="INITIALIZING" continueHref="/app/personal" />);
    expect(loading).toContain("กำลังเปิด DEMI ผ่าน LINE");
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('href="/app/personal"');

    const failed = renderToStaticMarkup(<WorkspaceLiffEntryScreen state="INIT_FAILED" continueHref="/app" />);
    expect(failed).toContain("เปิดผ่าน LINE ไม่สำเร็จ");
    expect(failed).toContain("ลองอีกครั้ง");

    const invalid = renderToStaticMarkup(<WorkspaceLiffEntryScreen state="NAVIGATION_INVALID" continueHref="/app" />);
    expect(invalid).toContain("ลิงก์นี้ไม่ถูกต้อง");
    expect(invalid).not.toContain("ลองอีกครั้ง");
    expect(invalid).toContain('href="/app"');
  });
});
