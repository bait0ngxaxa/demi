import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { getContext, redirect } = vi.hoisted(() => ({ getContext: vi.fn(), redirect: vi.fn() }));
vi.mock("@/modules/reporting/transport/parent-area-overview-context", () => ({ getParentAreaOverviewContext: getContext }));
vi.mock("next/navigation", () => ({ redirect }));

import { NetworkReportWorkspace } from "./network-report-workspace";
import AreasPage from "../areas/page";

function content() {
  const count = { grain: "PATIENT_PROGRAM", value: 1 };
  return { state: "AVAILABLE", dashboard: { state: "AVAILABLE", value: {
    patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 2 },
    relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
    programs: { grain: "PATIENT_PROGRAM", total: 2, active: 1, completed: 1 },
  } }, serviceProcess: { state: "AVAILABLE", value: {
    programsWithRoutineRecord: count, programsWithFloatingChartRecord: count,
    programsWithDreamCardRecord: count, programsWithConfidenceRecord: count,
  } } };
}

describe("unified network reporting", () => {
  it("renders each authorized Child as a nine-value row linked to its summary", async () => {
    getContext.mockResolvedValue([{ parent: { id: "parent", name: "แม่ข่าย" }, areas: [
      { hospital: { id: "child", name: "ลูกข่ายชื่อยาวสำหรับจอมือถือ" }, content: content() },
    ] }]);
    const html = renderToStaticMarkup(await NetworkReportWorkspace());
    expect(html).toContain("ลูกข่าย (1)");
    expect(html).toContain("PARENT_CHILD%3Aparent%3Achild");
    expect(html.match(/<td /gu)).toHaveLength(9);
    expect(html).not.toContain("/app/patients/");
    expect(html).not.toContain("<details");
    expect(html).toContain("grid-cols-2");
  });

  it("explains an empty active network", async () => {
    getContext.mockResolvedValue([{ parent: { id: "parent", name: "แม่ข่าย" }, areas: [] }]);
    expect(renderToStaticMarkup(await NetworkReportWorkspace())).toContain("ยังไม่มีลูกข่ายที่พร้อมแสดงรายงาน");
  });

  it("redirects the retained areas route to the unified network scope", () => {
    redirect.mockImplementation((href: string) => { throw new Error(href); });
    expect(() => AreasPage()).toThrow("/app/hospitals/reporting?scope=network");
  });
});
