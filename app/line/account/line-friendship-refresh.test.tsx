import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(), isLoggedIn: vi.fn(), getIDToken: vi.fn(), getAccessToken: vi.fn(),
  isInClient: vi.fn(), getContext: vi.fn(), requestFriendship: vi.fn(),
  effects: [] as (() => void | (() => void))[], refs: [] as { current: unknown }[], refIndex: 0,
}));
vi.mock("@line/liff", () => ({ default: mocks }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { mocks.effects.push(effect); },
  useRef: (initial: unknown) => {
    const index = mocks.refIndex++;
    return mocks.refs[index] ?? (mocks.refs[index] = { current: initial });
  },
  useState: (initial: unknown) => [initial, vi.fn()],
}));

import {
  LineAccountClient,
  refreshLineAccountFriendship,
  requestLineFriendshipAndRefresh,
} from "./line-account-client";

const initial = { status: "LINKED", canUnlink: true, reachability: "UNKNOWN", menuState: "UNKNOWN", cleanupState: null } as const;
const fetcher = vi.fn<typeof fetch>();
function mount(status: Parameters<typeof LineAccountClient>[0]["initial"] = initial): void {
  mocks.refIndex = 0;
  mocks.effects.length = 0;
  LineAccountClient({ initial: status, liffId: "123-app", publicOrigin: "https://demi.example.org" });
  for (const effect of mocks.effects) effect();
}
async function settle(): Promise<void> { for (let i = 0; i < 8; i++) await Promise.resolve(); }

describe("account page bounded LIFF friendship refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.refs.length = 0; mocks.effects.length = 0;
    mocks.init.mockResolvedValue(undefined); mocks.isLoggedIn.mockReturnValue(true);
    mocks.isInClient.mockReturnValue(true); mocks.getContext.mockReturnValue({ type: "utou", viewType: "full" });
    mocks.requestFriendship.mockResolvedValue(undefined);
    mocks.getIDToken.mockReturnValue("fresh-id-token"); mocks.getAccessToken.mockReturnValue("fresh-access-token");
    fetcher.mockImplementation(async () => Response.json({ reachability: "FRIEND", menuState: "UNKNOWN", cleanupState: null }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), location: { reload: vi.fn() } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["UNKNOWN", "NOT_FRIEND"] as const)("refreshes %s once after init, with fresh tokens only in POST body", async (reachability) => {
    const writeStorage = vi.fn();
    vi.stubGlobal("localStorage", { setItem: writeStorage });
    vi.stubGlobal("sessionStorage", { setItem: writeStorage });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount({ ...initial, reachability }); await settle();
    mount({ ...initial, reachability }); await settle();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(mocks.getIDToken).toHaveBeenCalledOnce();
    expect(mocks.getAccessToken).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]).toEqual(["/api/line/account/reachability", expect.objectContaining({ method: "POST", credentials: "same-origin", body: JSON.stringify({ idToken: "fresh-id-token", accessToken: "fresh-access-token" }) })]);
    expect(mocks.init.mock.invocationCallOrder[0]).toBeLessThan(mocks.getIDToken.mock.invocationCallOrder[0]);
    // A new page obtains current tokens again; no tokens are cached by the component.
    mocks.refs.length = 0; mocks.getIDToken.mockReturnValue("new-page-id-token");
    mount({ ...initial, reachability }); await settle();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1]?.body).toContain("new-page-id-token");
    expect(writeStorage).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore(); error.mockRestore();
  });

  it("refreshes unresolved unlinked cleanup without initiating a link", async () => {
    mount({ ...initial, status: "UNLINKED", canUnlink: false, cleanupState: "UNAVAILABLE" }); await settle();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/line/account/reachability");
  });

  it("does not poll after provider failure", async () => {
    fetcher.mockRejectedValue(new Error("private failure"));
    mount(); await settle(); mount(); await settle();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("waits for successful init and survives the Strict Mode effect restart with one request", async () => {
    mocks.refIndex = 0;
    LineAccountClient({ initial, liffId: "123-app", publicOrigin: "https://demi.example.org" });
    const initialize = mocks.effects[0];
    const cleanup = initialize();
    if (cleanup) cleanup();
    initialize();
    expect(fetcher).not.toHaveBeenCalled();
    await settle();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each(["getIDToken", "getAccessToken"] as const)("does not send a request without %s", async (method) => {
    mocks[method].mockReturnValue(null);
    await expect(refreshLineAccountFriendship()).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refreshes reachability once after the user completes the LIFF add-or-unblock prompt", async () => {
    await requestLineFriendshipAndRefresh();

    expect(mocks.requestFriendship).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(mocks.requestFriendship.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]);
    expect(fetcher.mock.calls[0][0]).toBe("/api/line/account/reachability");
  });

  it("skips friend, unauthenticated and clean unlinked accounts", async () => {
    for (const status of [
      { ...initial, reachability: "FRIEND" as const },
      { ...initial, status: "UNAUTHENTICATED" as const, canUnlink: false },
      { ...initial, status: "UNLINKED" as const, canUnlink: false, cleanupState: "CONFIRMED_CLEAN" as const },
    ]) { mocks.refs.length = 0; mount(status); await settle(); }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
