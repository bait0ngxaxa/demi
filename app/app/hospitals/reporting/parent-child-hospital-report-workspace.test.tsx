import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ParentChildHospitalReportPageProjection } from "@/modules/reporting/projections/hospital-report-projection";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";
import type { ParentChildHospitalReportTargetGroup } from "@/modules/reporting/services/parent-child-hospital-report-access-service";

import { ParentChildHospitalReportWorkspace } from "./parent-child-hospital-report-workspace";

const parentHospitalId = "11111111-1111-4111-8111-111111111111";
const childHospitalId = "22222222-2222-4222-8222-222222222222";
const hospitals: readonly HospitalReportingHospital[] = [{
  id: parentHospitalId,
  hospitalCode: "PARENT-01",
  name: "โรงพยาบาลแม่ข่ายสังเคราะห์",
  status: "ACTIVE",
}];
const parentGroups: readonly ParentChildHospitalReportTargetGroup[] = [{
  parent: { id: parentHospitalId, name: "โรงพยาบาลแม่ข่ายสังเคราะห์" },
  children: [{ id: childHospitalId, name: "โรงพยาบาลลูกข่ายสังเคราะห์" }],
}];
const report: ParentChildHospitalReportPageProjection = {
  operation: "PARENT_CHILD_REPORT",
  access: "PARENT_OWNER",
  parent: { id: parentHospitalId, name: "โรงพยาบาลแม่ข่ายสังเคราะห์" },
  hospital: { id: childHospitalId, name: "โรงพยาบาลลูกข่ายสังเคราะห์" },
  content: {
    state: "AVAILABLE",
    dashboard: {
      state: "AVAILABLE",
      value: {
        patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 3 },
        relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
        programs: { grain: "PATIENT_PROGRAM", total: 2, active: 1, completed: 1 },
      },
    },
    serviceProcess: {
      state: "AVAILABLE",
      value: {
        programsWithRoutineRecord: { grain: "PATIENT_PROGRAM", value: 2 },
        programsWithFloatingChartRecord: { grain: "PATIENT_PROGRAM", value: 1 },
        programsWithDreamCardRecord: { grain: "PATIENT_PROGRAM", value: 0 },
        programsWithConfidenceRecord: { grain: "PATIENT_PROGRAM", value: 0 },
      },
    },
  },
};

describe("Parent-to-Child Hospital report workspace", () => {
  it("shows exact-Child summary values without exposing patient details or export", () => {
    const markup = renderToStaticMarkup(createElement(ParentChildHospitalReportWorkspace, {
      hospitals,
      parentGroups,
      selection: { kind: "PARENT_CHILD", parentHospitalId, hospitalId: childHospitalId },
      report,
    }));

    expect(markup).toContain("โรงพยาบาลลูกข่ายสังเคราะห์");
    expect(markup).toContain("โรงพยาบาลแม่ข่ายสังเคราะห์");
    expect(markup).toContain("รายงานโรงพยาบาลลูกข่ายผ่านสิทธิ์เจ้าของโรงพยาบาลแม่ข่าย");
    expect(markup).not.toContain("Child Hospital");
    expect(markup).toContain("ภาพรวมรายงาน");
    expect(markup).toContain("ขั้นตอนบริการ");
    expect(markup).toContain("จำนวนความสัมพันธ์ผู้ป่วยกับโรงพยาบาล");
    expect(markup).toContain("ไม่ได้ยืนยันว่าบริการเสร็จสิ้นหรือเกิดผลสำเร็จ");
    expect(markup).toContain("Program ที่มีบันทึก Floating Chart");
    expect(markup).toContain(">3</dd>");
    expect(markup).toContain(">2</dd>");
    expect(markup).toContain(">1</dd>");
    expect(markup).toContain(">0</dd>");
    expect(markup).not.toContain("ยังไม่อนุมัติการเปิดเผยตัวเลข");
    expect(markup).toContain("เลือกโรงพยาบาลสำหรับรายงาน");
    expect(markup).toContain("DIRECT_OWNER:");
    expect(markup).toContain("PARENT_CHILD:");
    expect(markup).not.toContain("สมชาย");
    expect(markup).not.toContain("HOSPITAL-NUMBER");
    expect(markup).not.toContain("bloodSugar");
    expect(markup).not.toContain("/app/patients/");
    expect(markup).not.toContain("/api/v1/hospital/reporting/export");
    expect(markup).not.toContain("ส่งออก Excel");
    expect(markup).toContain(`href="/app#hospital-workspace-${parentHospitalId}"`);
    expect(markup).not.toContain(`href="/app#hospital-workspace-${childHospitalId}"`);
  });
});
