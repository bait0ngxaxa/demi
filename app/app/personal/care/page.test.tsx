// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATIENT_ACCESS_UNAVAILABLE } from "@/modules/patient-self/transport/patient-access-unavailable";
import {
  getPatientSelfRelationshipNavigationPageContext,
  getPatientServiceProgressPageContext,
  getPatientServicesHubFollowupsPageContext,
} from "@/modules/patient-self/transport/patient-self-care-page-context";
import { buildServiceProgress, type OwnServiceProgress } from "@/modules/patient-self/services/patient-service-progress-query-service";
import { progressRelationship } from "../../../../tests/support/service-progress";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/form", () => ({ default: ({ children, action }: { children: React.ReactNode; action: string }) => <form action={action}>{children}</form> }));
vi.mock("@/modules/patient-self/transport/patient-self-care-page-context", () => ({
  getPatientSelfRelationshipNavigationPageContext: vi.fn(),
  getPatientServiceProgressPageContext: vi.fn(),
  getPatientServicesHubFollowupsPageContext: vi.fn(),
}));
vi.mock("../patient-round-recording", () => ({ PatientRoundRecording: () => null }));

import Page from "./page";
import { ServicesHubTabs } from "./services-hub-tabs";

const ONE = "11111111-1111-4111-8111-111111111111";
const TWO = "33333333-3333-4333-8333-333333333333";
const ENDED = "44444444-4444-4444-8444-444444444444";

function service(relationshipId: string, hospitalName: string): OwnServiceProgress {
  const record = { ...progressRelationship(), id: relationshipId, hospital: { name: hospitalName, hospitalCode: hospitalName, status: "ACTIVE" as const } };
  const { progress, recordingRound } = buildServiceProgress(record, null, { readOnly: false });
  return { ...progress, recordingRound, relationship: { relationshipId, hospitalName, hospitalCode: hospitalName, hospitalNumber: null, hospitalStatus: "ACTIVE", careEndedAt: null } };
}

function navigation(relationshipId: string, hospitalName: string, careEndedAt: Date | null = null) {
  return { relationshipId, hospitalCode: hospitalName, hospitalName, hospitalNumber: null, hospitalStatus: "ACTIVE" as const, careEndedAt };
}

async function render(searchParams: Record<string, string | string[] | undefined> = {}): Promise<HTMLDivElement> {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(searchParams) }));
  return root;
}

describe("บริการ hub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPatientServiceProgressPageContext).mockResolvedValue([service(ONE, "รพ.ก")]);
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue([navigation(ONE, "รพ.ก")]);
    vi.mocked(getPatientServicesHubFollowupsPageContext).mockResolvedValue({ followups: [], plan: null });
  });

  it("opens on ครั้งบริการ with the request action, no selector for one Hospital and a history link", async () => {
    const root = await render();
    expect(root.querySelector("h1")?.textContent).toBe("บริการ");
    expect(root.querySelector('a[href="/app/personal/services"]')?.textContent).toBe("ขอรับบริการ");
    expect(root.querySelector("select")).toBeNull();
    expect(root.querySelector('[data-services-tab="rounds"]')?.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector('[data-services-tab="followups"]')?.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector(`a[href="/app/personal/care/${ONE}"]`)?.textContent).toContain("ประวัติการรับบริการ");
    expect(root.textContent).not.toContain("ประวัติการดูแล");
    expect(getPatientServicesHubFollowupsPageContext).toHaveBeenCalledWith(ONE, "/app/personal/care");
  });

  it("reads ?tab=followups, ignores LIFF platform keys and falls back to rounds for an unknown tab", async () => {
    const followups = await render({ tab: "followups", "liff.state": "/x", "liff.hback": "2" });
    expect(followups.querySelector('[data-services-tab="followups"]')?.hasAttribute("hidden")).toBe(false);
    expect(followups.textContent).toContain("การติดตามผลเริ่มตั้งแต่ครั้งที่ 3");
    const unknown = await render({ tab: "other", "liff.state": "/x" });
    expect(unknown.querySelector('[data-services-tab="rounds"]')?.hasAttribute("hidden")).toBe(false);
  });

  it("offers the selector only for several active Hospitals and falls back for an unknown or foreign relationship", async () => {
    vi.mocked(getPatientServiceProgressPageContext).mockResolvedValue([service(ONE, "รพ.ก"), service(TWO, "รพ.ข")]);
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue([navigation(ONE, "รพ.ก"), navigation(TWO, "รพ.ข"), navigation(ENDED, "รพ.ค", new Date())]);
    const second = await render({ relationshipId: TWO.toUpperCase() });
    expect([...second.querySelectorAll("select option")].map((option) => option.getAttribute("value"))).toEqual([ONE, TWO]);
    expect(getPatientServicesHubFollowupsPageContext).toHaveBeenLastCalledWith(TWO, "/app/personal/care");
    // The ended Hospital is not selectable but its history stays reachable.
    expect(second.querySelector(`a[href="/app/personal/care/${ENDED}"]`)).not.toBeNull();
    expect(second.querySelector(`a[href="/app/personal/care/${ONE}"]`)).toBeNull();
    await render({ relationshipId: ENDED });
    expect(getPatientServicesHubFollowupsPageContext).toHaveBeenLastCalledWith(ONE, "/app/personal/care");
  });

  it("keeps the ended-only history reachable and fails closed when SELF reads are denied", async () => {
    vi.mocked(getPatientServiceProgressPageContext).mockResolvedValue([]);
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue([navigation(ENDED, "รพ.ค", new Date())]);
    const ended = await render();
    expect(ended.textContent).toContain("ยังไม่มีหน่วยบริการที่ดูแลอยู่");
    expect(ended.querySelector(`a[href="/app/personal/care/${ENDED}"]`)).not.toBeNull();
    expect(getPatientServicesHubFollowupsPageContext).not.toHaveBeenCalled();

    vi.mocked(getPatientServiceProgressPageContext).mockResolvedValue(PATIENT_ACCESS_UNAVAILABLE);
    const denied = await render();
    expect(denied.querySelector("form")).toBeNull();
    expect(denied.querySelector("[data-services-tab]")).toBeNull();
  });
});

describe("services hub tabs", () => {
  it("switches panels and records ?tab= without navigating", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, "", `/app/personal/care?relationshipId=${ONE}&tab=rounds`);
    const pushState = vi.spyOn(window.history, "pushState");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<ServicesHubTabs initialTab="rounds" rounds={<p>รายครั้ง</p>} followups={<p>ผลติดตาม</p>} />));
    const followupsButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "การติดตาม");
    act(() => followupsButton?.click());
    expect(followupsButton?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-services-tab="rounds"]')?.hasAttribute("hidden")).toBe(true);
    expect(window.location.pathname + window.location.search).toBe(`/app/personal/care?relationshipId=${ONE}&tab=followups`);
    expect(pushState).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
