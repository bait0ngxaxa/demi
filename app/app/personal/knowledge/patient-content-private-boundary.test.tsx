import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
const h = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>, refIndex: 0, trusted: true,
  effect: undefined as (() => void | (() => void)) | undefined,
  events: new Map<string, (event?: unknown) => void>(), reload: vi.fn(),
}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()),
  useRef: (initial: unknown) => { const index = h.refIndex++; h.refs[index] ??= { current: initial }; return h.refs[index]; },
  useState: () => [h.trusted, (value: boolean) => { h.trusted = value; }],
  useLayoutEffect: (effect: () => void | (() => void)) => { h.effect = effect; },
}));
import { PatientContentPrivateBoundary } from "./patient-content-private-boundary";
let sequence = 0;
function render(requestId: string): ReactElement<{ children: unknown; hidden: boolean; inert: boolean }> {
  h.refIndex = 0;
  return PatientContentPrivateBoundary({ requestId, children: "private Content" });
}
beforeEach(() => {
  h.refs = []; h.refIndex = 0; h.trusted = true; h.effect = undefined; h.events.clear(); h.reload.mockClear();
  vi.stubGlobal("window", { addEventListener: (name: string, fn: (event?: unknown) => void) => h.events.set(name, fn), removeEventListener: (name: string) => h.events.delete(name), location: { reload: h.reload } });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: (name: string, fn: (event?: unknown) => void) => h.events.set(name, fn), removeEventListener: (name: string) => h.events.delete(name) });
});
afterEach(() => vi.unstubAllGlobals());
describe("route-local private Content lifetime", () => {
  it("pagehide immediately disables DOM interactions and removes private children", () => {
    const id = `pagehide-${++sequence}`; render(id); const root = { hidden: false, inert: false }; h.refs[0].current = root;
    h.effect?.(); h.events.get("pagehide")?.();
    expect(root).toEqual({ hidden: true, inert: true });
    const tree = render(id); expect(tree.props.hidden).toBe(true); expect(tree.props.inert).toBe(true); expect(tree.props.children).toBeNull();
  });
  it.each(["pageshow", "popstate", "visibilitychange"])("%s reloads authoritative data before trust", (event) => {
    const id = `restore-${++sequence}`; render(id); h.effect?.();
    h.events.get(event)?.({ persisted: true });
    expect(h.reload).toHaveBeenCalledOnce(); expect(h.trusted).toBe(false);
  });
  it("normal pageshow does not reload; Strict Mode cleanup/setup does not invalidate a fresh view", async () => {
    const id = `strict-${++sequence}`; render(id);
    const cleanup = h.effect?.(); h.events.get("pageshow")?.({ persisted: false });
    if (cleanup) cleanup(); h.effect?.(); await Promise.resolve();
    expect(h.reload).not.toHaveBeenCalled(); expect(h.trusted).toBe(true);
    expect(h.events.has("pagehide")).toBe(true);
  });
  it("a truly unmounted/history-cached request cannot regain trust; a new account/request starts fresh", async () => {
    const id = `history-${++sequence}`; render(id); const cleanup = h.effect?.(); if (cleanup) cleanup(); await Promise.resolve();
    expect(h.events.size).toBe(0);
    h.refs = []; render(id); h.effect?.(); expect(h.reload).toHaveBeenCalledOnce(); expect(h.trusted).toBe(false);
    h.refs = []; h.trusted = true; h.reload.mockClear(); render(`new-account-request-${++sequence}`); h.effect?.();
    expect(h.reload).not.toHaveBeenCalled(); expect(h.trusted).toBe(true);
  });
});
