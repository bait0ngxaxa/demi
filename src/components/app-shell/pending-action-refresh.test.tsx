// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), pathname: "/app" }));
const router = { refresh: mocks.refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => mocks.pathname }));
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
