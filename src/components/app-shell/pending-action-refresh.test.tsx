// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
const router = { refresh: mocks.refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { PendingActionRefresh } from "./pending-action-refresh";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); mocks.refresh.mockClear(); });

describe("return-to-window refresh", () => {
  it("refreshes on focus/visibility, throttles duplicate signals, protects pending mutations and removes listeners", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const container = document.createElement("div");
    container.id = "application-main-content";
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<PendingActionRefresh />));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(mocks.refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    // Time alone does not poll.
    expect(mocks.refresh).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event("focus")));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    const guard = document.createElement("div");
    guard.dataset.navigationGuard = "unknown-outcome";
    container.append(guard);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    guard.remove();
    const busy = document.createElement("button");
    busy.disabled = true;
    busy.setAttribute("aria-busy", "true");
    container.append(busy);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    busy.remove();
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
    vi.advanceTimersByTime(30_000);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    container.remove();
  });
});
