// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkAppointmentListItem, WorkAppointmentPage } from "@/modules/appointments/services/work-appointment-query-service";

import { WorkAppointmentView } from "./work-appointment-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/form", () => ({ default: ({ children, ...props }: ComponentProps<"form">) => <form {...props}>{children}</form> }));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} href={href}>{children}</a>;
  },
}));

const at = new Date("2026-11-20T03:00:00Z");
function item(appointmentId: string, pendingRequestBadges: WorkAppointmentListItem["pendingRequestBadges"]): WorkAppointmentListItem {
  return {
    appointmentId, relationshipId: "relationship", serviceCode: null, source: "HOSPITAL", isOneOffVisit: false,
    scheduledAt: at, durationMinutes: null, type: "FOLLOW_UP", locationType: "CLINIC", status: "SCHEDULED",
    patientDisplayName: `ผู้ป่วย ${appointmentId}`, hospitalName: "โรงพยาบาล ก", responsibleDisplayName: null, responsibleProfession: null,
    osmAtCreationDisplayName: null, assignedOsmDisplayName: null, appointer: { displayName: "พยาบาล", role: "NURSE" },
    pendingRequestBadges, hasUnassignedOsm: false, canAcceptAssignment: false, osmAcceptanceStatus: "NONE",
  } as WorkAppointmentListItem;
}
const hospital = { hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", access: "DIRECT", canCreate: false, canResolveRequests: true, canAcceptAssignments: false };
const page = {
  hospital, hospitals: [hospital], tab: "PENDING_REQUESTS", filters: {}, items: [], nextCursor: null, hasNextPage: false,
  responsibleFilter: { mode: "VISIBLE", options: [] }, canCreate: false, canResolveRequests: true, canAcceptAssignments: false,
} as unknown as WorkAppointmentPage;

function render(overrides: Partial<WorkAppointmentPage>): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(<WorkAppointmentView page={{ ...page, ...overrides }} queryError={null} />);
  return template.content;
}

describe("typed pending appointment requests on the work list", () => {
  it("names each pending kind on the row badge and the reviewer's dot", () => {
    const markup = render({ items: [
      item("both", { reschedule: true, staleReschedule: false, cancellation: true }),
      item("reschedule", { reschedule: true, staleReschedule: false, cancellation: false }),
      item("cancellation", { reschedule: false, staleReschedule: false, cancellation: true }),
      item("stale", { reschedule: true, staleReschedule: true, cancellation: false }),
    ] });
    const rows = [...markup.querySelectorAll("section[aria-label] li")];
    const badges = rows.map((row) => [...row.querySelectorAll("span")].map((span) => span.textContent ?? ""));
    expect(badges[0]).toEqual(expect.arrayContaining(["ขอเลื่อนนัด", "ขอยกเลิกนัด", "มีคำขอเลื่อนและยกเลิกนัดรอพิจารณา 1 รายการ"]));
    expect(badges[1]).toEqual(expect.arrayContaining(["ขอเลื่อนนัด", "มีคำขอเลื่อนนัดรอพิจารณา 1 รายการ"]));
    expect(badges[2]).toEqual(expect.arrayContaining(["ขอยกเลิกนัด", "มีคำขอยกเลิกนัดรอพิจารณา 1 รายการ"]));
    expect(badges[3]).toEqual(expect.arrayContaining(["คำขอก่อนแก้ไขนัด", "มีคำขอเลื่อนนัดรอพิจารณา 1 รายการ"]));
    expect(markup.textContent).not.toMatch(/รอเลื่อนนัด|รอยกเลิก|คำขอนัดหมายรอพิจารณา/);
  });

  it("shows no request dot to a viewer who cannot resolve requests", () => {
    const markup = render({ tab: "UPCOMING", canResolveRequests: false, items: [item("both", { reschedule: true, staleReschedule: false, cancellation: true })] });
    expect(markup.textContent).toContain("ขอเลื่อนนัด");
    expect(markup.querySelector(".sr-only")).toBeNull();
  });

  it.each([
    [undefined, "ไม่มีคำขอเลื่อนหรือยกเลิกนัดหมายที่รอดำเนินการ"],
    ["RESCHEDULE", "ไม่มีคำขอเลื่อนนัดที่รอดำเนินการ"],
    ["CANCELLATION", "ไม่มีคำขอยกเลิกนัดที่รอดำเนินการ"],
  ] as const)("uses the empty copy of the %s filter", (requestType, copy) => {
    expect(render({ filters: requestType ? { requestType } : {} }).textContent).toContain(copy);
  });

  it("offers the request-kind filter only on the pending-request tab, preselected from the page", () => {
    const select = render({ filters: { requestType: "CANCELLATION" } }).querySelector<HTMLSelectElement>('select[name="requestType"]');
    expect(select?.closest("label")?.firstChild?.textContent).toBe("ประเภทคำขอ");
    expect([...(select?.options ?? [])].map(({ value, textContent }) => [value, textContent])).toEqual([
      ["", "ทุกประเภท"], ["RESCHEDULE", "ขอเลื่อนนัด"], ["CANCELLATION", "ขอยกเลิกนัด"],
    ]);
    expect(select?.querySelector("option[selected]")?.getAttribute("value")).toBe("CANCELLATION");
    expect(render({ tab: "UPCOMING" }).querySelector('select[name="requestType"]')).toBeNull();
  });

  it("keeps the filter on pending-request links and the next page, and drops it on other tabs", () => {
    const markup = render({ filters: { requestType: "RESCHEDULE" }, hasNextPage: true, nextCursor: "next" });
    const hrefs = [...markup.querySelectorAll("a")].map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).toContain("/app/appointments?hospitalId=hospital-a&tab=PENDING_REQUESTS&requestType=RESCHEDULE");
    expect(hrefs).toContain("/app/appointments?hospitalId=hospital-a&tab=PENDING_REQUESTS&requestType=RESCHEDULE&cursor=next");
    expect(hrefs).toContain("/app/appointments?hospitalId=hospital-a&tab=UPCOMING");
    expect(hrefs.filter((href) => href.includes("tab=UPCOMING") || href.includes("tab=HISTORY")).join()).not.toContain("requestType");
  });
});
