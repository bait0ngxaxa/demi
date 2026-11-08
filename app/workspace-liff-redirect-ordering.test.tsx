// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LIFF_BROWSER_CONTEXT_KEY } from "@/modules/line/domain/line-liff-browser";

import { WorkspaceLiffBootstrap } from "./workspace-liff-bootstrap";
import { resetWorkspaceLiffInitializationForTests, WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS, type WorkspaceLiffSdk } from "./workspace-liff-gateway";

/**
 * Ordering of Workspace `liff.init()` against the unauthenticated redirect,
 * reproduced in a DOM with the real History API. `/app/layout.tsx` renders the
 * bootstrap as an earlier sibling of the Suspense boundary whose redirect the
 * Next.js client router applies in an effect (or a 1 s meta refresh loads
 * /login as a new document). This shows what is and is not guaranteed:
 *
 * - init STARTS no later than the redirect effect of the same commit;
 * - init COMPLETION is not guaranteed before the URL changes when the SDK
 *   chunk or LINE is slow (this is the race the review asked about);
 * - the outcome is still recorded, the /login document initializes again,
 *   and LINE Login round trips stay bounded by the loop latch.
 *
 * The SDK is mocked; real WebView timing is UAT (LINE_WORKSPACE_LIFF_UAT 31).
 */
const WORKSPACE_ID = "1234567890-Workspace";
let container: HTMLDivElement;
let root: Root;
const events: string[] = [];

/** Stands in for Next.js' redirect handling inside the Suspense boundary: navigates in an effect. */
function RedirectInEffect({ to }: { to: string }): null {
  useEffect(() => {
    events.push(`navigate:${to}`);
    window.history.replaceState(null, "", to);
  }, [to]);
  return null;
}

function slowSdk(): { sdk: WorkspaceLiffSdk; resolve: () => void; seenUrls: string[] } {
  let resolve: () => void = () => undefined;
  const seenUrls: string[] = [];
  const sdk: WorkspaceLiffSdk = {
    id: null,
    isInClient: () => true,
    init: vi.fn(() => {
      seenUrls.push(`${window.location.pathname}${window.location.search}`);
      events.push("init:start");
      return new Promise<void>((done) => {
        resolve = () => {
          events.push("init:resolved");
          done();
        };
      });
    }),
  };
  return { sdk, resolve: () => resolve(), seenUrls };
}

function context(): unknown {
  return JSON.parse(window.sessionStorage.getItem(LIFF_BROWSER_CONTEXT_KEY) ?? "null");
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  events.length = 0;
  resetWorkspaceLiffInitializationForTests();
  window.sessionStorage.clear();
  window.sessionStorage.setItem(LIFF_BROWSER_CONTEXT_KEY, JSON.stringify({ current: "WORKSPACE", mini: false, workspace: "PENDING" }));
  window.history.replaceState(null, "", "/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("Workspace LIFF init vs. the unauthenticated redirect", () => {
  it("starts loading the SDK in the same commit, before the redirect effect runs", async () => {
    const { sdk } = slowSdk();
    const load = vi.fn(async () => {
      events.push("sdk:load");
      return sdk;
    });
    await act(async () => root.render(
      <>
        <WorkspaceLiffBootstrap liffId={WORKSPACE_ID} load={load} />
        <RedirectInEffect to="/login?returnTo=%2Fapp%2Fpersonal%2Fmedications" />
      </>,
    ));
    expect(events.indexOf("sdk:load")).toBeGreaterThanOrEqual(0);
    expect(events.indexOf("sdk:load")).toBeLessThan(events.indexOf("navigate:/login?returnTo=%2Fapp%2Fpersonal%2Fmedications"));
  });

  it("does NOT guarantee init completes before the URL changes when the SDK is slow, yet records the outcome", async () => {
    const { sdk, resolve, seenUrls } = slowSdk();
    // A slow SDK chunk: it arrives only after the router has already replaced the route.
    let deliver: () => void = () => undefined;
    const load = vi.fn(() => new Promise<WorkspaceLiffSdk>((done) => { deliver = () => done(sdk); }));
    await act(async () => root.render(
      <>
        <WorkspaceLiffBootstrap liffId={WORKSPACE_ID} load={load} />
        <RedirectInEffect to="/login?returnTo=%2Fapp%2Fpersonal%2Fmedications" />
      </>,
    ));
    // Soft navigation to /login: the /app layout (and its bootstrap) unmounts, the document stays.
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => { deliver(); for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
    expect(events).toEqual(["navigate:/login?returnTo=%2Fapp%2Fpersonal%2Fmedications", "init:start"]);
    // The SDK ran on the already-replaced URL: liff.hback / lineAppVersion were gone before init. These are
    // bookkeeping for that document; the root entry already stored the LINE tokens before the secondary redirect.
    expect(seenUrls).toEqual(["/login?returnTo=%2Fapp%2Fpersonal%2Fmedications"]);
    await act(async () => { resolve(); for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
    expect(context()).toEqual({ current: "WORKSPACE", mini: false, workspace: "READY" });
  });

  it("initializes again when the 1 s meta refresh loads /login as a new document", async () => {
    const first = slowSdk();
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={WORKSPACE_ID} load={async () => first.sdk} />));
    // Meta refresh: a new document; the previous one's pending init is gone with it.
    act(() => root.unmount());
    resetWorkspaceLiffInitializationForTests();
    window.history.replaceState(null, "", "/login?returnTo=%2Fapp%2Fpersonal%2Fmedications");
    root = createRoot(container);
    const second = slowSdk();
    await act(async () => root.render(<WorkspaceLiffBootstrap liffId={WORKSPACE_ID} load={async () => second.sdk} />));
    await act(async () => { await Promise.resolve(); });
    expect(second.sdk.init).toHaveBeenCalledOnce();
    expect(second.seenUrls).toEqual(["/login?returnTo=%2Fapp%2Fpersonal%2Fmedications"]);
  });

  it("bounds LINE Login round trips whose code is lost to a redirect (loop latch)", async () => {
    window.history.replaceState(null, "", "/app/personal/medications?liff.hback=2&code=synthetic&liffClientId=1234567890");
    const stuck = slowSdk();
    for (let attempt = 0; attempt < WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS + 2; attempt += 1) {
      act(() => root.unmount());
      resetWorkspaceLiffInitializationForTests();
      root = createRoot(container);
      await act(async () => root.render(<WorkspaceLiffBootstrap liffId={WORKSPACE_ID} load={async () => stuck.sdk} />));
      await act(async () => { await Promise.resolve(); });
    }
    expect(stuck.sdk.init).toHaveBeenCalledTimes(WORKSPACE_LIFF_MAX_ENTRY_ATTEMPTS);
  });
});
