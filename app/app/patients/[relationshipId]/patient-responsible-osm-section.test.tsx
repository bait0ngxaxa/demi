import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PatientResponsibleOsmSection } from "./patient-responsible-osm-section";

const relationshipId = "22222222-2222-4222-8222-222222222222";

describe("Patient responsible OSM section", () => {
  it("shows the current OSM and assignment date without exposing a phone number", () => {
    const html = renderToStaticMarkup(
      <PatientResponsibleOsmSection
        canManageAssignment={false}
        relationshipId={relationshipId}
        state={{ status: "ASSIGNED", displayName: "สมใจ อสม.", assignedAt: new Date("2026-10-01T00:00:00.000Z") }}
      />,
    );

    expect(html).toContain("อสม. ผู้รับผิดชอบ");
    expect(html).toContain("รับผิดชอบอยู่");
    expect(html).toContain("สมใจ อสม.");
    expect(html).toContain("วันที่มอบหมาย");
    expect(html).not.toContain("เบอร์โทร");
    expect(html).not.toContain("/assignment");
  });

  it("links authorized managers to the exact relationship assignment workflow", () => {
    const html = renderToStaticMarkup(
      <PatientResponsibleOsmSection
        canManageAssignment
        relationshipId={relationshipId}
        state={{ status: "UNASSIGNED" }}
      />,
    );

    expect(html).toContain(`href="/app/patients/${relationshipId}/assignment"`);
    expect(html).toContain("ยังไม่มี อสม.");
  });

  it.each([
    ["UNAVAILABLE", "ยืนยันผู้รับผิดชอบปัจจุบันไม่ได้"],
    ["RESTRICTED", "ไม่มีสิทธิ์ดูรายละเอียดการมอบหมาย อสม."],
    ["NETWORK_RESTRICTED", "มุมมองเครือข่ายนี้ไม่แสดงข้อมูล อสม."],
    ["ERROR", "โหลดข้อมูล อสม. ผู้รับผิดชอบไม่สำเร็จ"],
  ] as const)("renders the distinct %s state", (status, message) => {
    const html = renderToStaticMarkup(
      <PatientResponsibleOsmSection canManageAssignment={false} relationshipId={relationshipId} state={{ status }} />,
    );

    expect(html).toContain(message);
    expect(html).not.toContain("ยังไม่มี อสม.");
  });
});
