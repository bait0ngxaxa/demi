// @vitest-environment jsdom

import { HospitalStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildHospitalHierarchyDirectory } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import type { GlobalReportingDirectory } from "@/modules/reporting/projections/global-reporting-projection";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

import { GlobalAdminReportingWorkspace } from "./global-admin-reporting-workspace";

const directory: GlobalReportingDirectory = {
  hierarchy: buildHospitalHierarchyDirectory([
    { id: "11111111-1111-4111-8111-111111111111", hospitalCode: "A", name: "โรงพยาบาลแม่ข่ายทดสอบ", status: HospitalStatus.ACTIVE, role: "PARENT", networkParentId: null },
  ]),
  statusCounts: {
    [HospitalStatus.ACTIVE]: 1,
    [HospitalStatus.PENDING_VERIFICATION]: 0,
    [HospitalStatus.SUSPENDED]: 0,
    [HospitalStatus.RETIRED]: 0,
  },
};

let container: HTMLDivElement;
let root: Root;
let originalActEnvironment: boolean | undefined;

function setInputValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
}

function query<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

beforeAll(() => {
  const flag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = flag.IS_REACT_ACT_ENVIRONMENT;
  flag.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/app/admin/reporting");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

describe("Global Admin reporting directory URL", () => {
  it("writes the search and status to the URL after typing stops, replacing the entry without navigating", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    act(() => root.render(createElement(GlobalAdminReportingWorkspace, { directory })));

    act(() => setInputValue(query<HTMLInputElement>("#global-hospital-search"), "  แม่ข่าย "));
    act(() => setInputValue(query<HTMLSelectElement>("#global-hospital-status"), "ACTIVE"));
    act(() => vi.advanceTimersByTime(299));
    expect(replaceState).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(replaceState).toHaveBeenCalledOnce();
    expect(pushState).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("q")).toBe("แม่ข่าย");
    expect(new URLSearchParams(window.location.search).get("hospitalStatus")).toBe("ACTIVE");
    expect(window.location.pathname).toBe("/app/admin/reporting");

    act(() => setInputValue(query<HTMLInputElement>("#global-hospital-search"), ""));
    act(() => setInputValue(query<HTMLSelectElement>("#global-hospital-status"), "ALL"));
    act(() => vi.advanceTimersByTime(300));
    expect(window.location.search).toBe("");
  });

  it("restores the filters from the URL when the directory is shown again", () => {
    window.history.replaceState(null, "", "/app/admin/reporting?q=%E0%B9%81%E0%B8%A1%E0%B9%88&hospitalStatus=SUSPENDED");
    act(() => root.render(createElement(GlobalAdminReportingWorkspace, { directory })));

    expect(query<HTMLInputElement>("#global-hospital-search").value).toBe("แม่");
    expect(query<HTMLSelectElement>("#global-hospital-status").value).toBe("SUSPENDED");
    expect(container.textContent).toContain("ไม่พบโรงพยาบาลตามเงื่อนไขนี้");
  });
});
