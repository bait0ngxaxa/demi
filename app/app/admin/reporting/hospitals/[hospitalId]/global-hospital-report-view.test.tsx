import { HospitalStatus } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HospitalHierarchyContext } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import type { HospitalReportingPageProjection } from "@/modules/reporting/projections/hospital-report-projection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/reporting/transport/global-reporting-search-actions", () => ({
  searchGlobalReportingHospitalsAction: vi.fn(),
}));

import { GlobalHospitalReportView } from "./global-hospital-report-view";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const parent = { id: "22222222-2222-4222-8222-222222222222", hospitalCode: "P", name: "โรงพยาบาลแม่ข่ายทดสอบ", status: HospitalStatus.ACTIVE };

function hierarchy(status: HospitalStatus, classification: HospitalHierarchyContext["classification"] = "SUBORDINATE"): HospitalHierarchyContext {
  return {
    hospital: { id: hospitalId, hospitalCode: "DEMO-CHILD", name: "รพ.สต.ลูกข่ายทดสอบ", status },
    classification,
    parentHospital: classification === "SUBORDINATE" ? parent : null,
    directChildCount: classification === "MAIN" ? 4 : 0,
    directChildren: [],
  };
}

const page: HospitalReportingPageProjection = {
  hospital: { id: hospitalId, hospitalCode: "DEMO-CHILD", name: "รพ.สต.ลูกข่ายทดสอบ" },
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

function render(context: HospitalHierarchyContext, report: HospitalReportingPageProjection | null): string {
  return renderToStaticMarkup(createElement(GlobalHospitalReportView, { hierarchy: context, page: report, initialView: "overview" }));
}

describe("Global ADMIN Hospital report page view", () => {
  it("owns one header: the Hospital name, its path back to the directory, status, network and actions", () => {
    const markup = render(hierarchy(HospitalStatus.ACTIVE), page);

    expect(markup.match(/<h1/gu)).toHaveLength(1);
    expect(markup).toMatch(/<h1[^>]*>รพ\.สต\.ลูกข่ายทดสอบ<\/h1>/u);
    expect(markup).toContain('href="/app/admin/reporting"');
    expect(markup).toContain(">รายงานระบบ</a>");
    expect(markup).toContain("ใช้งานอยู่");
    expect(markup).toContain("ลูกข่าย · โรงพยาบาลแม่ข่ายทดสอบ");
    expect(markup).toContain("ส่งออก Excel");
    expect(markup).toContain("เปลี่ยนโรงพยาบาล");
    expect(markup).not.toContain("กลับไปภาพรวม");
    expect(markup).not.toContain("DEMO-CHILD");
    // The Hospital name appears in the title and the breadcrumb only, not again as a section heading.
    expect(markup).not.toContain('id="hospital-report-context-heading"');
    expect(markup).toContain('id="overview-heading"');
    expect(markup).toContain(`action="/app/admin/reporting/hospitals/${hospitalId}"`);
  });

  it("names a Parent with its Child count and a Hospital outside any network", () => {
    expect(render(hierarchy(HospitalStatus.ACTIVE, "MAIN"), page)).toContain("แม่ข่าย · ลูกข่าย 4 แห่ง");
    expect(render(hierarchy(HospitalStatus.ACTIVE, "UNASSIGNED"), page)).toContain("ยังไม่อยู่ในเครือข่าย");
  });

  it("shows a Hospital that is not ACTIVE with one status Alert and no report or export", () => {
    const markup = render(hierarchy(HospitalStatus.PENDING_VERIFICATION), null);

    expect(markup).toContain("รายงานยังไม่พร้อม · สถานะ รอยืนยันการขึ้นทะเบียน");
    expect(markup.match(/role="alert"|role="status"/gu)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(markup).not.toContain("ส่งออก Excel");
    expect(markup).not.toContain('id="overview-heading"');
    expect(markup).not.toContain("ไฟล์ Excel ที่จะส่งออก");
    expect(markup).toContain("เปลี่ยนโรงพยาบาล");
  });
});
