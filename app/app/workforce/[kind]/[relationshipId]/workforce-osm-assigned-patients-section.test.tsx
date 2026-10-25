import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkforceOsmPatientPage } from "@/modules/patient-directory/services/patient-directory-query-service";

import { WorkforceOsmAssignedPatientsSection } from "./workforce-osm-assigned-patients-section";

const osmRelationshipId = "11111111-1111-4111-8111-111111111111";
const patientRelationshipId = "22222222-2222-4222-8222-222222222222";

const patientPage: WorkforceOsmPatientPage = {
  hospital: { id: "33333333-3333-4333-8333-333333333333", name: "โรงพยาบาลตัวอย่าง" },
  items: [{
    patientHospitalRelationshipId: patientRelationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospital: { id: "33333333-3333-4333-8333-333333333333", name: "โรงพยาบาลตัวอย่าง" },
    hospitalNumber: "HN-001",
  }],
  page: 2,
  pageSize: 25,
  total: 26,
  totalPages: 2,
  hasPreviousPage: true,
  hasNextPage: false,
};

describe("OSM assigned patient detail section", () => {
  it("shows bounded patient identities with exact detail links and pagination", () => {
    const html = renderToStaticMarkup(
      <WorkforceOsmAssignedPatientsSection currentAssignmentCount={30} relationshipId={osmRelationshipId} state={{ status: "READY", page: patientPage }} />,
    );

    expect(html).toContain("ผู้ป่วยในความรับผิดชอบ");
    expect(html).toContain("สมชาย ผู้ป่วย");
    expect(html).toContain("HN-001 · โรงพยาบาลตัวอย่าง");
    expect(html).toContain("รายชื่อที่แสดงได้ 26 ราย จากรายการมอบหมายที่ยังไม่สิ้นสุด 30 รายการ");
    expect(html).toContain("จำนวนรายการมอบหมายด้านบนยังคงนับรายการที่ยังไม่สิ้นสุดตามเกณฑ์เดิม");
    expect(html).toContain(`href="/app/patients/${patientRelationshipId}"`);
    expect(html).toContain("href=\"/app/workforce/osm/11111111-1111-4111-8111-111111111111?patientsPage=1\"");
    expect(html).toContain("หน้า 2 จาก 2");
  });

  it("keeps patient identities hidden when the viewer only has workforce-summary access", () => {
    const html = renderToStaticMarkup(
      <WorkforceOsmAssignedPatientsSection currentAssignmentCount={1} relationshipId={osmRelationshipId} state={{ status: "SUMMARY_ONLY" }} />,
    );

    expect(html).toContain("แสดงได้เฉพาะจำนวนรายการมอบหมาย");
    expect(html).not.toContain("สมชาย ผู้ป่วย");
    expect(html).not.toContain("/app/patients/");
  });

  it("reports a list failure without presenting it as an empty assignment", () => {
    const html = renderToStaticMarkup(
      <WorkforceOsmAssignedPatientsSection currentAssignmentCount={1} relationshipId={osmRelationshipId} state={{ status: "ERROR" }} />,
    );

    expect(html).toContain("โหลดรายชื่อผู้ป่วยไม่สำเร็จ");
    expect(html).not.toContain("ไม่มีผู้ป่วยที่มีบัญชี");
  });
});
