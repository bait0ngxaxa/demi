import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HospitalStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildHospitalHierarchyDirectory,
  type HospitalHierarchyContext,
  type HospitalHierarchyUnit,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import type { GlobalReportingDirectory } from "@/modules/reporting/projections/global-reporting-projection";

import { GlobalAdminReportingWorkspace } from "./global-admin-reporting-workspace";

const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const standaloneId = "33333333-3333-4333-8333-333333333333";

const records: readonly HospitalHierarchyUnit[] = [
  {
    id: parentId,
    hospitalCode: "DEMO-PARENT",
    name: "โรงพยาบาลแม่ข่ายทดสอบ",
    status: HospitalStatus.ACTIVE,
    parentHospitalId: null,
  },
  {
    id: childId,
    hospitalCode: "DEMO-CHILD",
    name: "รพ.สต.ลูกข่ายทดสอบ",
    status: HospitalStatus.PENDING_VERIFICATION,
    parentHospitalId: parentId,
  },
  {
    id: standaloneId,
    hospitalCode: "DEMO-STANDALONE",
    name: "โรงพยาบาลเดี่ยวทดสอบ",
    status: HospitalStatus.SUSPENDED,
    parentHospitalId: null,
  },
];

const hierarchy = buildHospitalHierarchyDirectory(records);
const directory: GlobalReportingDirectory = {
  hierarchy,
  statusCounts: {
    [HospitalStatus.ACTIVE]: 1,
    [HospitalStatus.PENDING_VERIFICATION]: 1,
    [HospitalStatus.SUSPENDED]: 1,
  },
};

function render(input: {
  selectedHospital?: HospitalHierarchyUnit | null;
  selectedHierarchy?: HospitalHierarchyContext | null;
} = {}): string {
  return renderToStaticMarkup(createElement(GlobalAdminReportingWorkspace, {
    directory,
    selectedHospital: input.selectedHospital ?? null,
    hierarchy: input.selectedHierarchy ?? null,
    page: null,
    selectedHospitalId: input.selectedHospital?.id ?? null,
    initialView: "overview",
  }));
}

describe("Global Admin reporting workspace", () => {
  it("shows database-backed organization counts and complete grouped Hospital choices", () => {
    const markup = render();

    expect(markup).toContain("จำนวนนี้นับโรงพยาบาลที่มีข้อมูลในระบบ");
    expect(markup).toContain("โรงพยาบาลทั้งหมด");
    expect(markup).toContain("โรงพยาบาลแม่ข่าย");
    expect(markup).toContain("โรงพยาบาลลูกข่าย");
    expect(markup).toContain("ค้นหาชื่อโรงพยาบาล");
    expect(markup).not.toContain("DEMO-PARENT");
    expect(markup).not.toContain("DEMO-CHILD");
    expect(markup).not.toContain("DEMO-STANDALONE");
    expect(markup).toContain("สถานะโรงพยาบาล");
    expect(markup).toContain("ดูโครงสร้างโรงพยาบาลและรายงานของแห่งที่เลือก ข้อมูลผู้ป่วยและ Program จำกัดอยู่ในโรงพยาบาลนั้น ไม่รวมแม่ข่ายหรือลูกข่าย");
    expect(markup).not.toContain("เปิดใช้เฉพาะ ADMIN");
    expect(markup).not.toContain("สภาพแวดล้อม demo");
    expect(markup).toContain("โรงพยาบาลแม่ข่ายทดสอบ");
    expect(markup).toContain("รพ.สต.ลูกข่ายทดสอบ");
    expect(markup).toContain("โรงพยาบาลเดี่ยวทดสอบ");
    expect(markup).toContain(`/app/admin/reporting?hospitalId=${parentId}`);
    expect(markup).toContain(`/app/admin/reporting?hospitalId=${childId}`);
    expect(markup).toContain("พบ 3 แห่ง จากทั้งหมด 3 แห่ง");
    expect(markup).toContain("รายชื่ออ้างอิง 78 แห่งไม่ได้หมายความว่าทุกแห่งมีข้อมูลในระบบ");
    expect(markup).toContain("ไม่ใช่จำนวนผู้ป่วย");
  });

  it("keeps pending Hospitals visible but presents no patient report as zero", () => {
    const selectedHospital = records[1];
    if (!selectedHospital) throw new Error("Expected a subordinate fixture");
    const selectedHierarchy: HospitalHierarchyContext = {
      hospital: selectedHospital,
      classification: "SUBORDINATE",
      parentHospital: records[0] ?? null,
      directChildCount: 0,
      directChildren: [],
      issues: [],
    };
    const markup = render({ selectedHospital, selectedHierarchy });

    expect(markup).toContain("รายงานผู้ป่วยและ Program ยังไม่พร้อมใช้งาน");
    expect(markup).not.toMatch(/Patient\/Program|Hospital ที่|Master ทั้ง/u);
    expect(markup).toContain("รอยืนยันการขึ้นทะเบียน");
    expect(markup).not.toContain("Program ทั้งหมด");
    expect(markup).not.toContain("relationship");
  });
});
