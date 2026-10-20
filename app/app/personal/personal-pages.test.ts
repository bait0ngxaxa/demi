import { HospitalStatus, Role } from "@prisma/client";
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
import { PATIENT_ACCESS_UNAVAILABLE } from "@/modules/patient-self/transport/patient-access-unavailable";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
const homeServices = vi.hoisted(() => ({ nextAppointment: vi.fn(), content: vi.fn() }));
vi.mock("@/modules/patient-self/services/patient-self-care-query-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/patient-self/services/patient-self-care-query-service")>()),
  getOwnNextAppointmentForRelationship: homeServices.nextAppointment,
}));
vi.mock("@/modules/hospital-content/services/hospital-content-patient-query-service", () => ({ listPatientHospitalContent: homeServices.content }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) }));
vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({ scheduleCurrentLineAccountReconciliation: vi.fn() }));
vi.mock("@/modules/patient-self/transport/patient-self-care-page-context", () => ({ getPatientSelfRelationshipNavigationPageContext: vi.fn() }));
vi.mock("@/modules/patient-self/transport/patient-self-page-context", () => ({
  getPatientPersonalHomePageContext: vi.fn(),
  getPatientSelfPageContext: vi.fn(),
}));

const completeContext = {
  actor: {
    userId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    roles: [Role.PATIENT],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  },
  person: { givenName: "สมชาย", familyName: "ใจดี" },
  hospitalRelationships: [
    {
      relationshipId: "44444444-4444-4444-8444-444444444444",
      hospitalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
      hospitalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
      hospitalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
    homeServices.nextAppointment.mockResolvedValue(null);
    homeServices.content.mockResolvedValue({ category: null, items: [], nextCursor: null, emptyState: "EMPTY_B" });
    vi.mocked(getPatientSelfPageContext).mockResolvedValue(profileOnlyContext);
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue(profileOnlyContext.hospitalRelationships);
  });

  it("renders the selected Hospital home with eight shortcuts, local content sections and a contact anchor", async () => {
    const markup = renderToStaticMarkup(await PersonalHomePage());

    expect(markup).toContain("สวัสดี, สมชาย ใจดี");
    expect(markup).toContain("โรงพยาบาล ก");
    expect(markup).not.toContain("โรงพยาบาล ข");
    expect(markup).not.toContain("HN-001");
    expect(markup).toContain('href="/app/personal/care/44444444-4444-4444-8444-444444444444"');
    expect(markup).toContain('href="/app/personal/appointments/44444444-4444-4444-8444-444444444444"');
    expect(markup).toContain('href="/app/personal/medications"');
    expect(markup).toContain('href="/app/personal/wellness"');
    expect(markup).toContain('href="/app/personal/measurements"');
    expect(markup).toContain('href="/app/personal/services"');
    expect(markup).toContain('href="/app/family"');
    expect(markup).toContain('href="/app/personal?hospital=44444444-4444-4444-8444-444444444444#personal-hospital-contact"');
    expect(markup).toContain('id="personal-home-news-heading"');
    expect(markup).toContain('id="personal-home-knowledge-heading"');
    expect(markup).toContain("ยังไม่มีข้อมูลติดต่อ");
    expect(markup).not.toContain("ไม่ได้สร้างโปรแกรมการดูแล");
    expect(markup).not.toContain("ข้อมูลที่คุณบันทึกเอง");
    expect(homeServices.nextAppointment).toHaveBeenCalledWith(completeContext.actor, "44444444-4444-4444-8444-444444444444");
    expect(homeServices.content).toHaveBeenCalledTimes(2);
    expect(homeServices.content).toHaveBeenCalledWith(completeContext.actor, {
      category: "NEWS",
      hospitalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      limit: 3,
    });
    expect(homeServices.content).toHaveBeenCalledWith(completeContext.actor, {
      hospitalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      limit: 3,
    });
    const links = markup.match(/<a\b[^>]*>/gu) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(9);
    for (const link of links) expect(link).toContain('data-prefetch="false"');
    expect(getPatientPersonalHomePageContext).toHaveBeenCalledOnce();
    expect(scheduleCurrentLineAccountReconciliation).toHaveBeenCalledOnce();
  });

  it("switches appointment, deep links and both content queries with an eligible Hospital", async () => {
    const secondRelationship = {
      ...completeContext.hospitalRelationships[1],
      hospitalStatus: HospitalStatus.ACTIVE,
    };
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue({
      ...completeContext,
      hospitalRelationships: [completeContext.hospitalRelationships[0], secondRelationship],
    });
    const markup = renderToStaticMarkup(await PersonalHomePage({
      searchParams: Promise.resolve({ hospital: secondRelationship.relationshipId }),
    }));

    expect(markup).toContain('name="hospital"');
    expect(markup).toContain('value="55555555-5555-4555-8555-555555555555" selected=""');
    expect(markup).toContain('href="/app/personal/care/55555555-5555-4555-8555-555555555555"');
    expect(markup).not.toContain("personal-hospital-contact");
    expect(homeServices.nextAppointment).toHaveBeenCalledWith(completeContext.actor, secondRelationship.relationshipId);
    expect(homeServices.content).toHaveBeenCalledWith(completeContext.actor, {
      category: "NEWS",
      hospitalId: secondRelationship.hospitalId,
      limit: 3,
    });
    expect(homeServices.content).toHaveBeenCalledWith(completeContext.actor, {
      hospitalId: secondRelationship.hospitalId,
      limit: 3,
    });
  });

  it("falls back to the first active Hospital for a forged locator without querying it", async () => {
    const markup = renderToStaticMarkup(await PersonalHomePage({
      searchParams: Promise.resolve({ hospital: "99999999-9999-4999-8999-999999999999" }),
    }));

    expect(markup).toContain("โรงพยาบาล ก");
    expect(markup).not.toContain("โรงพยาบาล ข");
    expect(homeServices.nextAppointment).toHaveBeenCalledWith(completeContext.actor, "44444444-4444-4444-8444-444444444444");
    for (const call of homeServices.content.mock.calls) {
      expect(call[1].hospitalId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      expect(call[1].hospitalId).not.toBe("99999999-9999-4999-8999-999999999999");
    }
  });

  it("formats the next appointment in Bangkok time across midnight and links to its detail", async () => {
    const appointmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    homeServices.nextAppointment.mockResolvedValue({
      appointmentId,
      scheduledAt: new Date("2026-10-20T17:30:00.000Z"),
    });
    const markup = renderToStaticMarkup(await PersonalHomePage());

    expect(markup).toContain("21 ตุลาคม 2569");
    expect(markup).toContain("00:30");
    expect(markup).toContain(`href="/app/personal/appointments/44444444-4444-4444-8444-444444444444/${appointmentId}"`);
  });

  it("keeps self-service entry points when no active Hospital exists", async () => {
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue({
      ...completeContext,
      person: { givenName: null, familyName: null },
      hospitalRelationships: completeContext.hospitalRelationships.map((relationship) => ({
        ...relationship,
        careEndedAt: new Date("2026-10-01T00:00:00.000Z"),
      })),
    });
    const markup = renderToStaticMarkup(await PersonalHomePage());

    expect(markup).toContain("สวัสดี");
    expect(markup).toContain("ยังไม่มีโรงพยาบาลที่พร้อมใช้งาน");
    expect(markup).toContain('href="/app/personal/care"');
    expect(markup).toContain('href="/app/personal/appointments"');
    expect(markup).toContain('href="/app/personal/services"');
    expect(markup).not.toContain('href="/app/personal/care/');
    expect(markup).not.toContain("personal-hospital-contact");
    expect(homeServices.nextAppointment).not.toHaveBeenCalled();
    expect(homeServices.content).not.toHaveBeenCalled();
  });

  it("renders escaped long Thai names and only creates a hospital switch for multiple active candidates", async () => {
    const hospitalName = "โรงพยาบาลภาษาไทย".repeat(20) + " <script>";
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue({
      ...completeContext,
      person: { givenName: "  สมชาย  ", familyName: null },
      hospitalRelationships: [{ ...completeContext.hospitalRelationships[0], hospitalName }],
    });
    const markup = renderToStaticMarkup(await PersonalHomePage());
    expect(markup).toContain("สวัสดี, สมชาย");
    expect(markup).toContain(hospitalName.replace("<script>", "&lt;script&gt;"));
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain('name="hospital"');
    expect(markup).toContain("min-h-20");
    expect(markup).toContain("grid-cols-4");
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

  it.each([
    { page: PersonalHomePage, title: "พื้นที่ส่วนตัว" },
    { page: PersonalCarePage, title: "ข้อมูลการดูแล" },
    { page: PersonalAppointmentsPage, title: "นัดหมาย" },
  ])("explains a denied $title entry instead of redirecting, without Patient data", async ({ page, title }) => {
    vi.mocked(getPatientPersonalHomePageContext).mockResolvedValue(PATIENT_ACCESS_UNAVAILABLE);
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue(PATIENT_ACCESS_UNAVAILABLE);
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain(`>${title}</h1>`);
    expect(markup).toContain("บัญชีนี้ยังเปิดข้อมูลผู้ป่วยไม่ได้");
    expect(markup).toContain("เข้าสู่ระบบด้วยบัญชีผู้ป่วยของคุณ");
    expect(markup).toContain('href="/app"');
    expect(markup).toContain("ออกจากระบบ");
    expect(markup).not.toMatch(/href="\/app\/personal/u);
    expect(markup).not.toContain("โรงพยาบาล ก");
    expect(markup).not.toContain("HN-001");
    expect(scheduleCurrentLineAccountReconciliation).not.toHaveBeenCalled();
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
