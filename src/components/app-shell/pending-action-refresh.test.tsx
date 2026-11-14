// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), pathname: "/app", search: "" }));
const router = { refresh: mocks.refresh };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => mocks.pathname,
  // A new object on each render also verifies that detection uses the serialized query.
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
import { PENDING_ACTION_REFRESH_INTERVAL_MS, PendingActionRefresh } from "./pending-action-refresh";

const STALE = PENDING_ACTION_REFRESH_INTERVAL_MS;
let container: HTMLDivElement;
let root: Root;
let visibility: ReturnType<typeof vi.spyOn>;

function render(checkedAt: number, pathname = mocks.pathname, strict = false): void {
  mocks.pathname = pathname;
  const element = <PendingActionRefresh checkedAt={checkedAt} />;
  act(() => root.render(strict ? <StrictMode>{element}</StrictMode> : element));
}
const focus = (): void => act(() => { window.dispatchEvent(new Event("focus")); });
const visible = (): void => act(() => { document.dispatchEvent(new Event("visibilitychange")); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  mocks.pathname = "/app";
  mocks.search = "";
  container = document.createElement("div");
  container.id = "application-main-content";
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  mocks.refresh.mockClear();
});

describe("pending indicator refresh lifecycle", () => {
  it.each([
    ["tab", "tab=UPCOMING", "tab=PENDING_REQUESTS"],
    ["Hospital", "hospitalId=A", "hospitalId=B"],
    ["filter", "tab=PENDING_REQUESTS", "tab=PENDING_REQUESTS&status=SCHEDULED"],
    ["pagination", "page=1", "page=2"],
  ])("refreshes once for stale same-pathname %s navigation", (_name, initial, next) => {
    mocks.search = initial;
    render(1, "/app/appointments");
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STALE);
    mocks.search = next;
    render(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    focus();
    visible();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    render(2);
    vi.advanceTimersByTime(STALE);
    render(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh an unchanged URL even with a new search-params object and stale data", () => {
    mocks.search = "tab=UPCOMING";
    render(1, "/app/appointments");
    vi.advanceTimersByTime(STALE);
    render(1);
    render(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("checks freshness without resetting it on query navigation and throttles subsequent changes", () => {
    render(1, "/app/appointments");
    vi.advanceTimersByTime(STALE - 1);
    mocks.search = "tab=UPCOMING";
    render(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    mocks.search = "tab=PENDING_REQUESTS";
    render(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    for (let page = 1; page <= 3; page++) {
      vi.advanceTimersByTime(1_000);
      mocks.search = `tab=PENDING_REQUESTS&page=${page}`;
      render(1);
    }
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(STALE - 3_000);
    mocks.search = "tab=PENDING_REQUESTS&page=4";
    render(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("uses fresh Server Action data before evaluating a simultaneous query change", () => {
    mocks.search = "tab=UPCOMING";
    render(1, "/app/appointments");
    vi.advanceTimersByTime(STALE);
    mocks.search = "tab=PENDING_REQUESTS";
    render(2);
    mocks.search = "hospitalId=B";
    render(2);
    focus();
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STALE);
    mocks.search = "hospitalId=C";
    render(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["unknown-outcome", "busy"])("guards query navigation during %s workflows without resetting freshness", (kind) => {
    render(1, "/app/appointments");
    vi.advanceTimersByTime(STALE);
    const guard = document.createElement("button");
    if (kind === "unknown-outcome") guard.dataset.navigationGuard = "unknown-outcome";
    else {
      guard.disabled = true;
      guard.setAttribute("aria-busy", "true");
    }
    container.append(guard);
    mocks.search = "tab=PENDING_REQUESTS";
    render(1);
    focus();
    visible();
    expect(mocks.refresh).not.toHaveBeenCalled();
    guard.remove();
    mocks.search = "hospitalId=B";
    render(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("waits for visibility after a hidden query navigation", () => {
    render(1, "/app/appointments");
    vi.advanceTimersByTime(STALE);
    visibility.mockReturnValue("hidden");
    mocks.search = "tab=PENDING_REQUESTS";
    render(1);
    focus();
    expect(mocks.refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    visible();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate query-triggered refreshes in Strict Mode", () => {
    mocks.search = "tab=UPCOMING";
    render(1, "/app/appointments", true);
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STALE);
    mocks.search = "tab=PENDING_REQUESTS";
    render(1, mocks.pathname, true);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    focus();
    visible();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    render(2, mocks.pathname, true);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on focus or visibility restoration only once indicators are stale, without polling", () => {
    render(1);
    focus();
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STALE * 10);
    // Time alone does not poll.
    expect(mocks.refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("hidden");
    visible();
    expect(mocks.refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    visible();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("coalesces focus and visibilitychange for the same return into one refresh", () => {
    render(1);
    vi.advanceTimersByTime(STALE);
    visible();
    focus();
    visible();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on a client route change once the shared layout's indicators are stale", () => {
    render(1, "/app");
    render(1, "/app/patients");
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STALE);
    render(1, "/app/appointments");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    // A refresh re-renders the layout with a new evaluation; that is fresh and the pathname is unchanged: no loop.
    render(2, "/app/appointments");
    render(2, "/app/appointments");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    render(2, "/app/more");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("treats a Server Action revalidation as fresh data and skips a redundant route-triggered refresh", () => {
    render(1, "/app/appointments");
    vi.advanceTimersByTime(STALE);
    // Revalidated layout and redirect arrive in the same commit.
    render(2, "/app/appointments/detail");
    expect(mocks.refresh).not.toHaveBeenCalled();
    focus();
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STALE);
    focus();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not interrupt pending forms, unknown-outcome recovery or busy workflow transitions", () => {
    render(1, "/app");
    vi.advanceTimersByTime(STALE);
    const guard = document.createElement("div");
    guard.dataset.navigationGuard = "unknown-outcome";
    container.append(guard);
    focus();
    render(1, "/app/patients");
    expect(mocks.refresh).not.toHaveBeenCalled();
    guard.remove();
    const busy = document.createElement("button");
    busy.disabled = true;
    busy.setAttribute("aria-busy", "true");
    container.append(busy);
    visible();
    expect(mocks.refresh).not.toHaveBeenCalled();
    busy.remove();
    visible();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh twice under React Strict Mode effect replay", () => {
    render(1, "/app", true);
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STALE);
    render(1, "/app/patients", true);
    focus();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("removes listeners on unmount", () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    render(1);
    act(() => root.unmount());
    expect(removeWindow).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    vi.advanceTimersByTime(STALE);
    focus();
    visible();
    expect(mocks.refresh).not.toHaveBeenCalled();
    root = createRoot(container);
  });
});
