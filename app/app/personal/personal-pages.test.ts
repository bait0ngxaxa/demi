import { HospitalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ComponentProps } from "react";

import PersonalHomePage from "./page";
import PersonalProfilePage from "./profile/page";
import PersonalCarePage from "./care/page";
import PersonalAppointmentsPage from "./appointments/page";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { getPatientSelfRelationshipNavigationPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";
import {
  getPatientPersonalHomePageContext,
  getPatientSelfPageContext,
} from "@/modules/patient-self/transport/patient-self-page-context";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) }));
vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({ scheduleCurrentLineAccountReconciliation: vi.fn() }));
vi.mock("@/modules/patient-self/transport/patient-self-care-page-context", () => ({ getPatientSelfRelationshipNavigationPageContext: vi.fn() }));
vi.mock("@/modules/patient-self/transport/patient-self-page-context", () => ({
  getPatientPersonalHomePageContext: vi.fn(),
  getPatientSelfPageContext: vi.fn(),
}));

const completeContext = {
  person: { givenName: "สมชาย", familyName: "ใจดี" },
  hospitalRelationships: [
    {
      relationshipId: "44444444-4444-4444-8444-444444444444",
      hospitalCode: "H-001",
      hospitalName: "โรงพยาบาล ก",
      hospitalNumber: "HN-001",
      hospitalStatus: HospitalStatus.ACTIVE,
      careEndedAt: null,
      hospitalContact: {
        status: "AVAILABLE" as const,
        contact: {
          hospital: { hospitalCode: "H-001", name: "โรงพยาบาล ก" },
          addressText: null,
          phoneNumber: null,
        },
      },
      profile: {
        gender: "ชาย",
        phoneNumber: "0812345678",
        addressText: "99 ถนนตัวอย่าง",
        emergencyContactName: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
      },
      profileSource: "LEGACY_FALLBACK" as const,
      profileVersion: 0,
    },
    {
      relationshipId: "55555555-5555-4555-8555-555555555555",
      hospitalCode: "H-002",
      hospitalName: "โรงพยาบาล ข",
      hospitalNumber: null,
      hospitalStatus: HospitalStatus.SUSPENDED,
      careEndedAt: null,
      hospitalContact: { status: "UNAVAILABLE" as const },
      profile: {
        gender: "ชาย",
        phoneNumber: "0812345678",
        addressText: "99 ถนนตัวอย่าง",
        emergencyContactName: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
      },
      profileSource: "LEGACY_FALLBACK" as const,
      profileVersion: 0,
    },
    {
      relationshipId: "77777777-7777-4777-8777-777777777777",
      hospitalCode: "H-003",
      hospitalName: "โรงพยาบาล ค",
      hospitalNumber: "HN-003",
      hospitalStatus: HospitalStatus.PENDING_VERIFICATION,
      careEndedAt: null,
      hospitalContact: { status: "UNAVAILABLE" as const },
      profile: {
        gender: "ชาย",
        phoneNumber: "0812345678",
        addressText: "99 ถนนตัวอย่าง",
        emergencyContactName: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
      },
      profileSource: "LEGACY_FALLBACK" as const,
      profileVersion: 0,
    },
  ],
};

const profileOnlyContext = {
  person: completeContext.person,
  hospitalRelationships: completeContext.hospitalRelationships.map(({ hospitalContact, ...relationship }) => {
    void hospitalContact;
    return relationship;
  }),
};

describe("Patient Personal pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue(completeContext);
    vi.mocked(getPatientSelfPageContext).mockResolvedValue(profileOnlyContext);
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue(profileOnlyContext.hospitalRelationships);
  });

  it("renders a useful Personal Home from the own authorized projection", async () => {
    const markup = renderToStaticMarkup(await PersonalHomePage());

    expect(markup).toContain("พื้นที่ส่วนตัว");
    expect(markup).toContain("สมชาย ใจดี");
    expect(markup).toContain("ข้อมูลของฉัน");
    expect(markup).toContain("โรงพยาบาล ก");
    expect(markup).toContain("โรงพยาบาลถูกระงับการใช้งาน");
    expect(markup).toContain("รอยืนยันการขึ้นทะเบียน");
    expect(markup).toContain("HN-001");
    expect(markup).toContain('href="/app/personal/care"');
    expect(markup).toContain('href="/app/personal/appointments"');
    expect(markup).toContain('href="/app/personal/profile"');
    expect(markup).toContain('href="/app/family"');
    expect(markup).not.toContain('href="/app/patients/assigned"');
    expect(markup).not.toContain('href="/app/hospitals/contact"');
    expect(markup).not.toContain("เพิ่มบริการ");
    expect(markup).toContain("นัดหมาย");
    expect(markup).toContain("ยังไม่มีข้อมูลติดต่อ");
    expect(getPatientPersonalHomePageContext).toHaveBeenCalledOnce();
    expect(scheduleCurrentLineAccountReconciliation).toHaveBeenCalledOnce();
  });

  it("prioritizes care, appointments and requests before supporting health and account activities", async () => {
    const markup = renderToStaticMarkup(await PersonalHomePage());
    const orderedSections = ["patient-self-identity-heading", "personal-primary-heading", "personal-health-heading", "patient-self-hospitals-heading", "personal-account-heading"];
    const positions = orderedSections.map((id) => markup.indexOf(`id="${id}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const primary = markup.slice(markup.indexOf('id="personal-primary-heading"'), markup.indexOf('id="personal-health-heading"'));
    const destinations = ["care", "appointments", "services"];
    const links = [...primary.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
    expect(links).toEqual(destinations.map((area) => `/app/personal/${area}`));
    for (const area of ["medications", "wellness", "profile", "knowledge", "password"]) expect(markup).toContain(`href="/app/personal/${area}"`);
    expect(markup).toContain("รับทราบนัดหรือขอยกเลิกเมื่อทำได้");
    expect(markup).toContain("ไม่ได้สร้างโปรแกรมการดูแล นัดหมาย หรือมอบหมาย อสม. ให้อัตโนมัติ");
    expect(markup).toContain("ไม่ใช่คำแนะนำทางการแพทย์");
    expect(markup).toContain("ไม่ได้ให้สิทธิ์ดูข้อมูลสุขภาพทั้งหมดโดยอัตโนมัติ");
    for (const claim of ["งานค้าง", "เกินกำหนด", "ความเสี่ยง", "ความก้าวหน้า", "บริการเสร็จสิ้น", "BMI", "คะแนนสุขภาพ"]) expect(markup).not.toContain(claim);
    expect(markup).not.toMatch(/href="\/app\/(?:patients|hospitals|workforce|admin)/u);
    expect(markup).not.toContain("0812345678");
    expect(markup).not.toContain("99 ถนนตัวอย่าง");
  });

  it.each([1, 3])("keeps %s Hospital relationships distinct with exact care and profile paths", async (count) => {
    const relationships = completeContext.hospitalRelationships.slice(0, count);
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue({ ...completeContext, hospitalRelationships: relationships });
    const markup = renderToStaticMarkup(await PersonalHomePage());
    for (const relationship of relationships) {
      expect(markup).toContain(relationship.hospitalName);
      expect(markup).not.toContain(relationship.hospitalCode);
      expect(markup).toContain(`href="/app/personal/care/${relationship.relationshipId}"`);
      expect(markup).toContain(`href="/app/personal/profile/${relationship.relationshipId}"`);
    }
    expect(markup.match(/href="\/app\/personal\/care\//gu)).toHaveLength(count);
    expect(markup.match(/href="\/app\/personal\/profile\//gu)).toHaveLength(count);
    expect(markup).not.toContain("โรงพยาบาลหลัก");
    if (count === 3) {
      expect(markup).toContain("โรงพยาบาลถูกระงับการใช้งาน");
      expect(markup).toContain("รอยืนยันการขึ้นทะเบียน");
      expect(markup).toContain("ยังไม่ได้บันทึก");
    }
  });

  it("renders long Thai identity safely and avoids prefetching every linked private workspace", async () => {
    const hospitalName = "โรงพยาบาลภาษาไทย".repeat(20) + " <script>";
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue({
      ...completeContext,
      person: { givenName: "  สมชาย  ", familyName: null },
      hospitalRelationships: [{ ...completeContext.hospitalRelationships[0], hospitalName }],
    });
    const markup = renderToStaticMarkup(await PersonalHomePage());
    expect(markup).toContain("สมชาย</h2>");
    expect(markup).toContain(hospitalName.replace("<script>", "&lt;script&gt;"));
    expect(markup).not.toContain("<script>");
    const links = markup.match(/<a\b[^>]*>/gu) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toContain('data-prefetch="false"');
  });

  it("keeps self-service entry points available with no Hospitals without inventing records or names", async () => {
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue({ person: { givenName: null, familyName: null }, hospitalRelationships: [] });
    const markup = renderToStaticMarkup(await PersonalHomePage());
    expect(markup).toContain("ยังไม่ได้บันทึกชื่อในระบบ");
    expect(markup).toContain("ยังไม่มีข้อมูลโรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย");
    for (const area of ["care", "appointments", "services", "medications", "wellness", "profile", "knowledge"]) expect(markup).toContain(`href="/app/personal/${area}"`);
    expect(markup).not.toMatch(/href="\/app\/personal\/(?:care|profile)\//u);
    expect(markup).not.toContain("ข้อมูลผู้ป่วยยังไม่พร้อมแสดง");
  });

  it.each(["care", "appointments"] as const)("continues the selected %s area through each exact Hospital without a competing action", async (area) => {
    const page = area === "care" ? PersonalCarePage : PersonalAppointmentsPage;
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain('href="/app/personal"');
    for (const relationship of completeContext.hospitalRelationships) expect(markup).toContain(`href="/app/personal/${area}/${relationship.relationshipId}"`);
    const otherArea = area === "care" ? "appointments" : "care";
    expect(markup).not.toContain(`href="/app/personal/${otherArea}/`);
    expect(getPatientSelfRelationshipNavigationPageContext).toHaveBeenCalledOnce();
  });

  it.each(["care", "appointments"] as const)("shows a truthful empty %s selection with a Personal return path", async (area) => {
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue([]);
    const page = area === "care" ? PersonalCarePage : PersonalAppointmentsPage;
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain("ยังไม่มีข้อมูลโรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย");
    expect(markup).toContain('href="/app/personal"');
    expect(markup).not.toMatch(/href="\/app\/personal\/(?:care|appointments)\//u);
  });

  it("shows an explicit incomplete state without fabricating profile values", async () => {
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue(null);

    const markup = renderToStaticMarkup(await PersonalHomePage());

    expect(markup).toContain("ข้อมูลผู้ป่วยยังไม่พร้อมแสดง");
    expect(markup).not.toContain("สมชาย");
    expect(markup).not.toContain('href="/app/personal/profile"');
    expect(markup).toContain("กรุณาติดต่อโรงพยาบาลที่ลงทะเบียนให้คุณ");
    expect(markup).not.toContain("การดูแลและบริการ");
    expect(scheduleCurrentLineAccountReconciliation).toHaveBeenCalledOnce();
  });

  it("shows identity facts and Hospital-specific profile navigation", async () => {
    const markup = renderToStaticMarkup(await PersonalProfilePage());

    for (const value of [
      "ข้อมูลของฉัน",
      "สมชาย",
      "ใจดี",
      "ข้อมูลนี้ใช้สำหรับโรงพยาบาลนี้",
      'href="/app/personal/profile/44444444-4444-4444-8444-444444444444"',
      'href="/app/personal/password"',
    ]) {
      expect(markup).toContain(value);
    }
    expect(markup).not.toContain("วันเกิด");
    expect(markup).not.toContain("อายุ");
    expect(markup).not.toContain("การวินิจฉัย");
    expect(markup).not.toContain("ข้อมูลติดต่อโรงพยาบาล");
  });

  it("shows an incomplete profile state when the identity chain cannot resolve", async () => {
    vi.mocked(getPatientSelfPageContext).mockResolvedValue(null);

    const markup = renderToStaticMarkup(await PersonalProfilePage());

    expect(markup).toContain("ไม่พบข้อมูลโปรไฟล์ที่เชื่อมกับบัญชีนี้");
  });

  it("renders every optional field as not recorded when the persisted value is null", async () => {
    vi.mocked(getPatientSelfPageContext).mockResolvedValue({
      person: { givenName: null, familyName: null },
      hospitalRelationships: [],
    });

    const markup = renderToStaticMarkup(await PersonalProfilePage());

    expect(markup).toContain("ยังไม่ได้บันทึก");
    expect(markup).toContain("โรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย");
    expect(markup).toContain("ยังไม่มีข้อมูลโรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย");
  });
});
