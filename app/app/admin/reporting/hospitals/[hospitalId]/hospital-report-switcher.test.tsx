// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GlobalReportingHospitalSearchActionResult } from "@/modules/reporting/transport/global-reporting-search-actions";

const mocks = vi.hoisted(() => ({
  search: vi.fn<(value: string) => Promise<GlobalReportingHospitalSearchActionResult>>(),
  router: { push: vi.fn<(href: string) => void>() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/modules/reporting/transport/global-reporting-search-actions", () => ({
  searchGlobalReportingHospitalsAction: mocks.search,
}));

import { HospitalReportSwitcher } from "./hospital-report-switcher";

const currentId = "11111111-1111-4111-8111-111111111111";
const firstId = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";

let container: HTMLDivElement;
let root: Root;
let originalActEnvironment: boolean | undefined;

function input(): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!element) throw new Error("Missing combobox");
  return element;
}

function toggle(): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>("button");
  if (!element) throw new Error("Missing toggle");
  return element;
}

async function type(value: string): Promise<void> {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

function press(key: string): void {
  act(() => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeAll(() => {
  const flag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = flag.IS_REACT_ACT_ENVIRONMENT;
  flag.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers();
  mocks.router.push.mockReset();
  mocks.search.mockReset().mockResolvedValue({
    status: "OK",
    items: [
      { id: currentId, name: "โรงพยาบาลปัจจุบัน", parentName: null, registeredAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: firstId, name: "รพ.สต.บ้านนา", parentName: "โรงพยาบาลแม่ข่ายเหนือ", registeredAt: new Date("2026-01-02T00:00:00.000Z") },
      { id: secondId, name: "รพ.สต.บ้านนา", parentName: "โรงพยาบาลแม่ข่ายใต้", registeredAt: new Date("2026-01-03T00:00:00.000Z") },
    ],
    page: 1,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(HospitalReportSwitcher, { currentHospitalId: currentId, view: "service" })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

afterAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

describe("Hospital report switcher", () => {
  it("searches on the server after typing stops and tells same-named Hospitals apart", async () => {
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(input());

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input(), "บ้านนา");
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(mocks.search).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith("บ้านนา");

    const options = [...container.querySelectorAll('[role="option"]')].map((option) => option.textContent);
    // The Hospital already open is not offered again.
    expect(options).toEqual(["รพ.สต.บ้านนา · ลูกข่ายของ โรงพยาบาลแม่ข่ายเหนือ", "รพ.สต.บ้านนา · ลูกข่ายของ โรงพยาบาลแม่ข่ายใต้"]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("พบ 2 แห่ง");
  });

  it("moves through results with the arrow keys and opens the active one with Enter in the same view", async () => {
    act(() => toggle().click());
    await type("บ้านนา");

    press("ArrowDown");
    press("ArrowDown");
    press("ArrowUp");
    expect(input().getAttribute("aria-activedescendant")).toContain(firstId);
    press("Enter");

    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(`/app/admin/reporting/hospitals/${firstId}?view=service`);
    expect(container.querySelector('[role="combobox"]')).toBeNull();
  });

  it("closes with Escape and returns focus to the button", async () => {
    act(() => toggle().click());
    await type("บ้านนา");
    press("Escape");

    expect(container.querySelector('[role="combobox"]')).toBeNull();
    expect(document.activeElement).toBe(toggle());
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
