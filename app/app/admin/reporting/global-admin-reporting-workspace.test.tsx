import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HospitalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildHospitalHierarchyDirectory,
  type HospitalNetworkRecord,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import type { GlobalReportingDirectory } from "@/modules/reporting/projections/global-reporting-projection";

const { searchParams } = vi.hoisted(() => ({ searchParams: { current: new URLSearchParams() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams.current }));

import { GlobalAdminReportingWorkspace } from "./global-admin-reporting-workspace";

const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const standaloneId = "33333333-3333-4333-8333-333333333333";

const records: readonly HospitalNetworkRecord[] = [
  {
    id: parentId,
    hospitalCode: "DEMO-PARENT",
    name: "โรงพยาบาลแม่ข่ายทดสอบ",
    status: HospitalStatus.ACTIVE,
    role: "PARENT",
    networkParentId: null,
  },
  {
    id: childId,
    hospitalCode: "DEMO-CHILD",
    name: "รพ.สต.ลูกข่ายทดสอบ",
    status: HospitalStatus.PENDING_VERIFICATION,
    role: "CHILD",
    networkParentId: parentId,
  },
  {
    id: standaloneId,
    hospitalCode: "DEMO-STANDALONE",
    name: "โรงพยาบาลเดี่ยวทดสอบ",
    status: HospitalStatus.SUSPENDED,
    role: "PARENT",
    networkParentId: null,
  },
];

const hierarchy = buildHospitalHierarchyDirectory(records);
const directory: GlobalReportingDirectory = {
  hierarchy,
  statusCounts: {
    [HospitalStatus.ACTIVE]: 1,
    [HospitalStatus.PENDING_VERIFICATION]: 1,
    [HospitalStatus.SUSPENDED]: 1,
    [HospitalStatus.RETIRED]: 0,
  },
};

function render(query = ""): string {
  searchParams.current = new URLSearchParams(query);
  return renderToStaticMarkup(createElement(GlobalAdminReportingWorkspace, { directory }));
}

describe("Global Admin reporting directory", () => {
  beforeEach(() => {
    searchParams.current = new URLSearchParams();
  });

  it("shows database-backed organization counts and complete grouped Hospital choices", () => {
    const markup = render();

    expect(markup).toContain("<h1");
    expect(markup).toContain("รายงานระบบ");
    expect(markup).not.toContain("รายงานของโรงพยาบาลที่เลือก");
    expect(markup).not.toContain("รายงานสำหรับผู้ดูแลระบบ DEMI");
    expect(markup).toContain("จำนวนนี้นับโรงพยาบาลที่ลงทะเบียนในระบบตามเครือข่ายปัจจุบัน");
    expect(markup).toContain("โรงพยาบาลทั้งหมด");
    expect(markup).toContain("โรงพยาบาลแม่ข่าย");
    expect(markup).toContain("โรงพยาบาลลูกข่าย");
    expect(markup).toContain("ค้นหาชื่อโรงพยาบาล");
    expect(markup).toContain('placeholder="พิมพ์ชื่อโรงพยาบาล"');
    expect(markup).not.toContain("DEMO-PARENT");
    expect(markup).not.toContain("DEMO-CHILD");
    expect(markup).not.toContain("DEMO-STANDALONE");
    expect(markup).toContain("สถานะโรงพยาบาล");
    expect(markup).not.toContain("เปิดใช้เฉพาะ ADMIN");
    expect(markup).not.toContain("สภาพแวดล้อม demo");
    expect(markup).toContain("พบ 3 แห่ง จากทั้งหมด 3 แห่ง");
    expect(markup).not.toContain("78 แห่ง");
    expect(markup).toContain("ไม่ใช่จำนวนผู้ป่วย");
  });

  it("links every Hospital row to its own report page, never to the directory route", () => {
    const markup = render();

    expect(markup).toContain(`href="/app/admin/reporting/hospitals/${parentId}"`);
    expect(markup).toContain(`href="/app/admin/reporting/hospitals/${childId}"`);
    expect(markup).toContain(`href="/app/admin/reporting/hospitals/${standaloneId}"`);
    expect(markup).not.toContain("?hospitalId=");
    expect(markup).toContain(">โรงพยาบาลแม่ข่ายทดสอบ</a>");
    expect(markup).toContain(">รพ.สต.ลูกข่ายทดสอบ</a>");
    expect(markup).toContain("เปิดรายงาน");
    expect(markup).toContain("ดูสถานะ");
    expect(markup).not.toContain("เปิดรายงานเฉพาะแห่ง");
    expect(markup).toContain("รอยืนยันการขึ้นทะเบียน");
  });

  it("starts from the search and status in the URL", () => {
    const markup = render("q=ลูกข่าย&hospitalStatus=PENDING_VERIFICATION");

    expect(markup).toContain('value="ลูกข่าย"');
    expect(markup).toContain('<option value="PENDING_VERIFICATION" selected="">');
    expect(markup).toContain("พบ 1 แห่ง จากทั้งหมด 3 แห่ง");
    expect(markup).toContain("<details class=\"mb-1 border-t border-border pt-2\" open=\"\"");
    expect(markup).not.toContain(`href="/app/admin/reporting/hospitals/${standaloneId}"`);
  });

  it("ignores an unknown status in the URL and explains an empty search by name only", () => {
    expect(render("hospitalStatus=RETIRED")).toContain("พบ 3 แห่ง จากทั้งหมด 3 แห่ง");

    const empty = render("q=ไม่มีชื่อนี้");
    expect(empty).toContain("ไม่พบโรงพยาบาลตามเงื่อนไขนี้");
    expect(empty).toContain("ลองค้นหาด้วยชื่ออื่น หรือเลือกทุกสถานะ");
    expect(empty).not.toContain("รหัส");
  });
});
