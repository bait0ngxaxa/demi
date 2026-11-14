import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkAppointmentPage } from "@/modules/appointments/services/work-appointment-query-service";

import { WorkAppointmentView, type WorkAppointmentPendingScope } from "./work-appointment-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/form", () => ({ default: ({ children, ...props }: ComponentProps<"form">) => <form {...props}>{children}</form> }));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} href={href}>{children}</a>;
  },
}));

const page = {
  hospital: { hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", access: "DIRECT", canCreate: false, canResolveRequests: true, canAcceptAssignments: false },
  hospitals: [
    { hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก" },
    { hospitalId: "hospital-b", hospitalName: "โรงพยาบาล ข" },
    { hospitalId: "hospital-c", hospitalName: "โรงพยาบาล ค" },
  ],
  tab: "PENDING_REQUESTS",
  filters: {},
  items: [],
  nextCursor: null,
  hasNextPage: false,
  responsibleFilter: { mode: "VISIBLE", options: [] },
  canCreate: false,
  canResolveRequests: true,
  canAcceptAssignments: false,
} as unknown as WorkAppointmentPage;

const scope: WorkAppointmentPendingScope = {
  tab: "PENDING_REQUESTS",
  totalCount: 8,
  hospitals: [
    { hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", count: 2 },
    { hospitalId: "hospital-b", hospitalName: "โรงพยาบาล ข", count: 4 },
    { hospitalId: "hospital-c", hospitalName: "โรงพยาบาล ค", count: 2 },
  ],
};

describe("multi-Hospital pending scope on the appointment queue", () => {
  it("distinguishes the selected Hospital's list from the aggregate and links each Hospital queue", () => {
    const html = renderToStaticMarkup(<WorkAppointmentView page={page} pendingScope={scope} queryError={null} />);
    expect(html).toContain("คำขอนัดหมายรอพิจารณา รวม 8 รายการ จาก 3 โรงพยาบาล");
    expect(html).toContain("รายการด้านล่างแสดงเฉพาะ โรงพยาบาล ก");
    for (const hospitalId of ["hospital-a", "hospital-b", "hospital-c"]) {
      expect(html).toContain(`href="/app/appointments?hospitalId=${hospitalId}&amp;tab=PENDING_REQUESTS"`);
    }
    expect(html).toMatch(/aria-current="page"[^>]*href="\/app\/appointments\?hospitalId=hospital-a&amp;tab=PENDING_REQUESTS"/);
    expect(html).toContain("4 รายการ");
    // The existing Hospital selector stays available.
    expect(html).toContain('name="hospitalId"');
  });

  it("stays hidden when only the selected Hospital has pending work, or for another tab", () => {
    const onlyCurrent = { ...scope, totalCount: 2, hospitals: scope.hospitals.slice(0, 1) };
    expect(renderToStaticMarkup(<WorkAppointmentView page={page} pendingScope={onlyCurrent} queryError={null} />)).not.toContain("pending-scope-heading");
    expect(renderToStaticMarkup(<WorkAppointmentView page={{ ...page, tab: "UPCOMING" }} pendingScope={scope} queryError={null} />)).not.toContain("pending-scope-heading");
    expect(renderToStaticMarkup(<WorkAppointmentView page={page} queryError={null} />)).not.toContain("pending-scope-heading");
  });

  it("offers the switch when the selected Hospital is idle but another has pending work", () => {
    const elsewhere = { ...scope, totalCount: 4, hospitals: scope.hospitals.slice(1, 2) };
    const html = renderToStaticMarkup(<WorkAppointmentView page={page} pendingScope={elsewhere} queryError={null} />);
    expect(html).toContain("คำขอนัดหมายรอพิจารณา รวม 4 รายการ จาก 1 โรงพยาบาล");
    expect(html).toContain('href="/app/appointments?hospitalId=hospital-b&amp;tab=PENDING_REQUESTS"');
  });
});
