import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PatientAssignedDirectoryPage } from "@/modules/patient-directory/services/patient-directory-query-service";

import { AssignedPatientDirectoryView } from "./assigned-patient-directory-view";

const result: PatientAssignedDirectoryPage = {
  items: [{
    patientProfileId: "patient-1",
    patientHospitalRelationshipId: "relationship-1",
    displayName: "สมชาย ผู้ป่วย",
    hospital: { id: "hospital-1", name: "โรงพยาบาล ก" },
    hospitalNumber: "HN-001",
    classification: null,
    selfRegisteredAt: null,
    activeProgramId: null,
  }],
  lookupType: "NAME",
  value: "",
  classificationFilter: "ALL",
  page: 1,
  pageSize: 25,
  total: 51,
  totalPages: 3,
  hasPreviousPage: false,
  hasNextPage: true,
  hospitalFilter: null,
};

function render(
  page: PatientAssignedDirectoryPage | null = result,
  errorMessage: string | null = null,
  taskMode: "screening" | "followup" | null = null,
): string {
  return renderToStaticMarkup(<AssignedPatientDirectoryView
    lookupType={page?.lookupType ?? "NAME"}
    value={page?.value ?? ""}
    classificationFilter={page?.classificationFilter ?? "ALL"}
    result={page}
    errorMessage={errorMessage}
    taskMode={taskMode}
  />);
}

describe("assigned patient operational directory", () => {
  it("identifies the current assigned scope and offers one care entry per relationship", () => {
    const html = render();
    expect(html).toContain("มอบหมายให้คุณอยู่ในขณะนี้");
    expect(html).toContain('href="/app"');
    expect(html.match(/href="\/app\/patients\/relationship-1"/gu)).toHaveLength(1);
    expect(html).toContain("เปิดผู้ป่วยเพื่อดูแลต่อ");
    expect(html).toContain("สมชาย ผู้ป่วย");
    expect(html).toContain("โรงพยาบาล: โรงพยาบาล ก");
    expect(html).toContain("HN-001");
    expect(html).toContain("focus-visible:ring-inset");
    expect(html).not.toContain('href="/app/patients?');
    for (const invented of ["งานค้าง", "เกินกำหนด", "ตอบรับการมอบหมาย", "ความคืบหน้า", "ครั้งที่ 6"]) {
      expect(html).not.toContain(invented);
    }
  });

  it("shows the authoritative scoped total rather than the loaded row count", () => {
    const html = render();
    expect(html).toContain("พบ 51 ความสัมพันธ์ผู้ป่วยที่รับผิดชอบ");
    expect(html).not.toContain("พบ 1 ความสัมพันธ์");
    expect(html).toContain("หน้า 1 จาก 3");
  });

  it("keeps two Hospital relationships for the same person distinct", () => {
    const first = result.items[0];
    if (!first) throw new Error("Missing fixture");
    const html = render({ ...result, items: [first, {
      ...first,
      patientHospitalRelationshipId: "relationship-2",
      hospital: { id: "hospital-2", name: "โรงพยาบาล ข" },
      hospitalNumber: "HN-002",
    }] });
    expect(html).toContain("โรงพยาบาล: โรงพยาบาล ก");
    expect(html).toContain("โรงพยาบาล: โรงพยาบาล ข");
    expect(html).toContain("HN-002");
    expect(html).toContain('href="/app/patients/relationship-2"');
  });

  it("preserves exact HN, classification and lookup mode in pagination", () => {
    const html = render({ ...result, lookupType: "HOSPITAL_NUMBER", value: "HN-001", classificationFilter: "RISK", page: 2, hasPreviousPage: true });
    expect(html).toContain('action="/app/patients/assigned"');
    // next/form submits as a GET navigation; HTML forms without a method default to GET.
    expect(html).not.toMatch(/method="post"/iu);
    expect(html).toContain('name="classification"');
    expect(html).toContain('href="/app/patients/assigned?lookupType=HOSPITAL_NUMBER&amp;value=HN-001&amp;classification=RISK"');
    expect(html).toContain('href="/app/patients/assigned?lookupType=HOSPITAL_NUMBER&amp;value=HN-001&amp;page=3&amp;classification=RISK"');
    expect(html).toContain("พบ 51 ความสัมพันธ์ผู้ป่วยตามการค้นหาและตัวกรอง");
    expect(html).toContain("HN แบบตรงตัว");
  });

  it("preserves a Thai partial-name search in pagination", () => {
    const html = render({ ...result, value: "สมชาย" });
    expect(html).toContain(`value=${encodeURIComponent("สมชาย")}&amp;page=2`);
    expect(html).toContain("ล้างการค้นหาและตัวกรอง");
  });

  it("distinguishes no current assignments from no filtered results", () => {
    const empty = { ...result, items: [], total: 0, totalPages: 1, hasNextPage: false };
    const html = render(empty);
    expect(html).toContain("ยังไม่มีผู้ป่วยที่ได้รับมอบหมายในขอบเขตที่ใช้งานได้");
    expect(html).toContain("ติดต่อเจ้าของโรงพยาบาล");
    expect(html).not.toContain("ล้างการค้นหาและตัวกรอง");
    expect(html).not.toContain('aria-label="หน้าผู้ป่วยที่รับผิดชอบ"');
    for (const page of [{ ...empty, value: "ไม่พบ" }, { ...empty, classificationFilter: "DIABETES" as const }]) {
      const filtered = render(page);
      expect(filtered).toContain("ไม่พบผู้ป่วยตามการค้นหาและตัวกรอง");
      expect(filtered).not.toContain("ยังไม่มีผู้ป่วยที่ได้รับมอบหมาย");
      expect(filtered).toContain('href="/app/patients/assigned"');
      expect(filtered).toContain("ลองเปลี่ยนคำค้นหา");
    }
  });

  it("offers safe recovery after invalid search without showing a roster or count", () => {
    const html = render(null, "กรุณาตรวจสอบคำค้นหา");
    expect(html).toContain("ไม่สามารถค้นหาได้");
    expect(html).toContain("กรุณาตรวจสอบคำค้นหา");
    expect(html).toContain("ล้างการค้นหาและตัวกรอง");
    expect(html).not.toContain("พบ 51");
    expect(html).not.toContain("relationship-1");
  });

  it("keeps screening selection inside the authorized directory and opens the existing screening workflow", () => {
    const html = render(result, null, "screening");

    expect(html).toContain("คัดกรองผู้ป่วย");
    expect(html).toContain('name="task" value="screening"');
    expect(html).toContain('href="/app/patients/relationship-1/screenings/new"');
    expect(html).toContain("เริ่มคัดกรองผู้ป่วยรายนี้");
    expect(html).not.toContain('href="/app/patients/relationship-1"');
  });

  it("keeps follow-up mode through paging and opens the existing relationship follow-up form", () => {
    const html = render({ ...result, hasPreviousPage: true }, null, "followup");

    expect(html).toContain("บันทึกติดตาม");
    expect(html).toContain('href="/app/patients/relationship-1/followups/new"');
    expect(html).toContain("บันทึกติดตามผู้ป่วยรายนี้");
    expect(html).toContain('href="/app/patients/assigned?lookupType=NAME&amp;task=followup"');
  });

  it("opens the active Program follow-up round instead of a relationship follow-up", () => {
    const first = result.items[0];
    if (!first) throw new Error("Missing fixture");
    const html = render({ ...result, items: [{ ...first, activeProgramId: "program-1" }] }, null, "followup");

    expect(html).toContain('href="/app/patients/relationship-1/programs/program-1/followups/new"');
    expect(html).not.toContain('href="/app/patients/relationship-1/followups/new"');

    const screening = render({ ...result, items: [{ ...first, activeProgramId: "program-1" }] }, null, "screening");
    expect(screening).toContain('href="/app/patients/relationship-1/screenings/new"');
    expect(screening).not.toContain("programs/program-1");
  });

  it("names the selected Hospital, keeps it through search and paging, and offers a way back to every Hospital", () => {
    const hospitalId = "44444444-4444-4444-8444-444444444444";
    const html = render({
      ...result,
      value: "สมชาย",
      classificationFilter: "RISK",
      hospitalFilter: { hospitalId, hospitalName: "โรงพยาบาล ก" },
    }, null, "screening");

    expect(html).toContain("แสดงเฉพาะผู้ป่วยของ<span class=\"font-semibold\">โรงพยาบาล ก</span>");
    expect(html).toContain(`name="hospitalId" value="${hospitalId}"`);
    expect(html).toContain(`page=2&amp;classification=RISK`);
    expect(html).toContain(`task=screening&amp;hospitalId=${hospitalId}&amp;value=`);
    // Clearing the search keeps the Hospital; clearing the Hospital keeps the task and search.
    expect(html).toContain(`href="/app/patients/assigned?task=screening&amp;hospitalId=${hospitalId}"`);
    expect(html).toContain(`href="/app/patients/assigned?lookupType=NAME&amp;task=screening&amp;value=${encodeURIComponent("สมชาย")}&amp;classification=RISK"`);
    expect(html).toContain("ดูผู้ป่วยจากทุกโรงพยาบาล");
  });

  it("states that a Hospital outside the assigned scope shows no patients", () => {
    const html = render({
      ...result,
      items: [],
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hospitalFilter: { hospitalId: "99999999-9999-4999-8999-999999999999", hospitalName: null },
    });

    expect(html).toContain("ไม่พบโรงพยาบาลที่เลือกในขอบเขตที่คุณรับผิดชอบ จึงไม่แสดงผู้ป่วย");
    expect(html).toContain('href="/app/patients/assigned?lookupType=NAME"');
    expect(html).not.toContain("relationship-1");
  });
});
