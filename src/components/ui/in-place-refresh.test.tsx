// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InPlaceRefreshBoundary, InPlaceRefreshButton } from "./in-place-refresh";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
function render(requestId: string): void {
  root.render(<InPlaceRefreshBoundary requestId={requestId}>
    <input aria-label="draft" defaultValue="saved" />
    <InPlaceRefreshButton>refresh</InPlaceRefreshButton>
  </InPlaceRefreshBoundary>);
}
beforeEach(() => { mocks.refresh.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
function input(): HTMLInputElement {
  const field = host.querySelector("input");
  if (!field) throw new Error("Missing input");
  return field;
}
describe("in-place recovery lifetime", () => {
  it("preserves local drafts on ordinary server-action revalidation", async () => {
    await act(() => render("first"));
    const original = input();
    original.value = "unsaved";
    await act(() => render("revalidated"));
    expect(input()).toBe(original);
    expect(input().value).toBe("unsaved");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("does not discard local state on a click or failed refresh without a new server response", async () => {
    await act(() => render("first"));
    const original = input();
    original.value = "unsaved";
    await act(() => host.querySelector("button")?.click());
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await act(() => render("first"));
    expect(input()).toBe(original);
    expect(input().value).toBe("unsaved");
    await act(() => render("fresh"));
    expect(input()).not.toBe(original);
    expect(input().value).toBe("saved");
  });
});
