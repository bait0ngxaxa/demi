// @vitest-environment jsdom

import { HospitalStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { HospitalHierarchyContext } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import type { HospitalReportingPageProjection } from "@/modules/reporting/projections/hospital-report-projection";
import type { GlobalReportingHospitalSearchActionResult } from "@/modules/reporting/transport/global-reporting-search-actions";

const mocks = vi.hoisted(() => ({
  search: vi.fn<(value: string) => Promise<GlobalReportingHospitalSearchActionResult>>(),
  router: { push: vi.fn<(href: string) => void>() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/modules/reporting/transport/global-reporting-search-actions", () => ({
  searchGlobalReportingHospitalsAction: mocks.search,
}));

import { GlobalHospitalReportView } from "./global-hospital-report-view";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const path = `/app/admin/reporting/hospitals/${hospitalId}`;

const hierarchy: HospitalHierarchyContext = {
  hospital: { id: hospitalId, hospitalCode: "DEMO", name: "โรงพยาบาลทดสอบ", status: HospitalStatus.ACTIVE },
  classification: "UNASSIGNED",
  parentHospital: null,
  directChildCount: 0,
  directChildren: [],
};

const page: HospitalReportingPageProjection = {
  hospital: { id: hospitalId, hospitalCode: "DEMO", name: "โรงพยาบาลทดสอบ" },
  cohort: "ACTIVE",
  counts: {
    patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    programs: { grain: "PATIENT_PROGRAM", total: 0, active: 0, completed: 0 },
  },
  serviceProcess: {
    programsWithRoutineRecord: { grain: "PATIENT_PROGRAM", value: 0 },
    programsWithFloatingChartRecord: { grain: "PATIENT_PROGRAM", value: 0 },
    programsWithDreamCardRecord: { grain: "PATIENT_PROGRAM", value: 0 },
    programsWithConfidenceRecord: { grain: "PATIENT_PROGRAM", value: 0 },
  },
  filters: { search: "", progress: "", status: "" },
  roundProgress: { rounds: [0, 0, 0, 0, 0, 0, 0], afterRecorded: 0, completed: 0 },
  page: { items: [], total: 0, number: 1, previousCursor: null, pageSize: 20, nextCursor: null },
};

let container: HTMLDivElement;
let root: Root;
let originalActEnvironment: boolean | undefined;

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

function combobox(): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!element) throw new Error("Missing combobox");
  return element;
}

beforeAll(() => {
  const flag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = flag.IS_REACT_ACT_ENVIRONMENT;
  flag.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", path);
  mocks.router.push.mockReset();
  mocks.search.mockReset().mockResolvedValue({
    status: "OK",
    items: [{ id: otherId, name: "โรงพยาบาลอื่น", parentName: null, registeredAt: new Date("2026-01-01T00:00:00.000Z") }],
    page: 1,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
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

describe("Global ADMIN Hospital report view interactions", () => {
  it("keeps the view on screen in the URL without navigating, and switching Hospitals opens that view", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    act(() => root.render(createElement(GlobalHospitalReportView, { hierarchy, page, initialView: "overview" })));

    act(() => button("รายงานการจัดบริการ").click());
    expect(window.location.pathname).toBe(path);
    expect(new URLSearchParams(window.location.search).get("view")).toBe("service");
    expect(pushState).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();

    act(() => button("เปลี่ยนโรงพยาบาล").click());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(combobox(), "อื่น");
      combobox().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => combobox().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    act(() => combobox().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(`/app/admin/reporting/hospitals/${otherId}?view=service`);
  });

  it("keeps the other report parameters when the view changes", () => {
    window.history.replaceState(null, "", `${path}?search=HN1&view=overview`);
    act(() => root.render(createElement(GlobalHospitalReportView, { hierarchy, page, initialView: "overview" })));

    act(() => button("รายงานการจัดบริการ").click());
    expect(window.location.search).toBe("?search=HN1&view=service");
  });
});
