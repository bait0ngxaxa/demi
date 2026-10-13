import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";

import ApplicationPage from "./page";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listActorHospitalWorkspaces } from "@/modules/auth/services/actor-workspace-service";

const { mockedRedirect } = vi.hoisted(() => ({ mockedRedirect: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("@/modules/auth/services/actor-workspace-service", () => ({
  listActorHospitalWorkspaces: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/line/transport/line-reconciliation-scheduler", () => ({
  scheduleCurrentLineAccountReconciliation: vi.fn().mockResolvedValue(undefined),
}));

const patientActor: ActorContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.PATIENT],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

describe("application home workspace routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(patientActor);
    vi.mocked(listActorHospitalWorkspaces).mockResolvedValue([]);
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("sends a Patient-only account to Personal Home", async () => {
    await expect(ApplicationPage()).rejects.toThrow("NEXT_REDIRECT:/app/personal");
    expect(mockedRedirect).toHaveBeenCalledWith("/app/personal");
    expect(scheduleCurrentLineAccountReconciliation).not.toHaveBeenCalled();
  });

  it("keeps a multi-role Patient and OSM on the Work home by default", async () => {
    vi.mocked(getProtectedApplicationActor).mockResolvedValue({
      ...patientActor,
      roles: [Role.OSM, Role.PATIENT],
      osmHospitalRelationships: [
        {
          hospitalId: "44444444-4444-4444-8444-444444444444",
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    const page = await ApplicationPage();

    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(getProtectedApplicationActor).toHaveBeenCalledOnce();
    expect(page).toBeDefined();
  });
  async function renderHome(actor: ActorContext, status: HospitalStatus = HospitalStatus.ACTIVE): Promise<string> {
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(actor);
    vi.mocked(listActorHospitalWorkspaces).mockResolvedValue(
      [...new Set([...actor.hospitalMemberships, ...actor.osmHospitalRelationships].map(({ hospitalId }) => hospitalId))].map((hospitalId) => ({ hospitalId, hospitalName: `โรงพยาบาล ${hospitalId}`, hospitalCode: hospitalId, hospitalStatus: status })),
    );
    return renderToStaticMarkup(await ApplicationPage());
  }

  const hospitalId = "44444444-4444-4444-8444-444444444444";
  function staff(membershipType: MembershipType, roles: readonly Role[] = [Role.HOSPITAL]): ActorContext {
    return { ...patientActor, roles, hospitalMemberships: [{ hospitalId, membershipType, profession: Profession.NURSE, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] };
  }

  it.each([MembershipType.OWNER, MembershipType.MEMBER])("prioritizes patient care and keeps scoped staff operations for %s", async (type) => {
    const html = await renderHome(staff(type));
    expect(html).toContain(`/app/patients?hospitalId=${hospitalId}`);
    expect(html.indexOf(`/app/patients?hospitalId=${hospitalId}`)).toBeLessThan(html.indexOf("ข้อมูลบัญชีและสิทธิ์"));
    expect(html).toContain(`/app/patients/provision?hospitalId=${hospitalId}`);
    expect(html).toContain(`/app/patients/activation?hospitalId=${hospitalId}`);
    expect(html).toContain('href="/app/patients/service-requests"');
    expect(html).toContain("ไม่จำกัดเฉพาะโรงพยาบาลเดียว");
    // ADR-0008 amendment (D1): a MEMBER reaches workforce only for OSM, with a scoped description.
    expect(html.includes(`/app/workforce?hospitalId=${hospitalId}`)).toBe(true);
    expect(html.includes("เพิ่ม อสม. และดูแลการเปิดใช้งานบัญชี อสม.")).toBe(type === MembershipType.MEMBER);
    expect(html.includes("จัดการสมาชิกและ อสม. ในโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง")).toBe(type === MembershipType.OWNER);
    expect(html.includes('href="/app/patients/service-catalog"')).toBe(type === MembershipType.OWNER);
    for (const path of ["contact", "knowledge", "reporting"]) {
      expect(html.includes(`href="/app/hospitals/${path}?hospitalId=${hospitalId}"`)).toBe(type === MembershipType.OWNER);
    }
    expect(html.includes("บริหารโรงพยาบาล · สิทธิ์เจ้าของโดยตรง")).toBe(type === MembershipType.OWNER);
    expect(html.includes("จัดการ อสม. · สิทธิ์สมาชิกโดยตรง")).toBe(type === MembershipType.MEMBER);
    expect(scheduleCurrentLineAccountReconciliation).toHaveBeenCalledOnce();
    expect(html).not.toMatch(/งานถัดไป|งานค้าง|วันนี้|เปอร์เซ็นต์/);
    expect(html).toContain("focus-visible:ring-focus-ring");
    expect(html).toContain('aria-labelledby="workspace-heading"');
  });

  it("shows OSM assigned care first without general directory or bulk import", async () => {
    const html = await renderHome({ ...patientActor, roles: [Role.OSM], osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] });
    expect(html).toContain('href="/app/patients/assigned"');
    expect(html.indexOf('href="/app/patients/assigned"')).toBeLessThan(html.indexOf(`/app/patients/provision?hospitalId=${hospitalId}`));
    expect(html).not.toContain(`/app/patients?hospitalId=${hospitalId}`);
    expect(html).not.toContain("นำเข้าผู้ป่วย");
    expect(html).not.toContain("/app/workforce");
    expect(html).not.toContain("/app/personal");
  });

  it.each([Role.OSM, Role.HOSPITAL])("keeps Work and Personal distinct for %s + Patient", async (role) => {
    const html = await renderHome(role === Role.HOSPITAL ? staff(MembershipType.MEMBER, [role, Role.PATIENT]) : { ...patientActor, roles: [role, Role.PATIENT] });
    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(html).toContain('href="/app/personal"');
    expect(html).toContain("หน้านี้เป็นพื้นที่ทำงาน");
  });

  it("makes governance the first operational area for ADMIN without patient access", async () => {
    const html = await renderHome({ ...patientActor, roles: [Role.ADMIN] });
    expect(html).toContain('href="/app/admin/reporting"');
    expect(html).toContain('href="/app/admin/hospitals"');
    expect(html).toContain('href="/app/admin/hospital-onboarding"');
    expect(html).not.toContain('id="workspace-heading"');
    expect(html).not.toContain('/app/patients');
    expect(html.indexOf("กำกับดูแลและรายงานระบบ")).toBeLessThan(html.indexOf("ข้อมูลบัญชีและสิทธิ์"));
  });

  it("renders a truthful empty state for unassociated OSM", async () => {
    const html = await renderHome({ ...patientActor, roles: [Role.OSM] });
    expect(html).toContain("ยังไม่มีการดำเนินงานที่พร้อมใช้งาน");
    expect(html).not.toContain('/app/patients');
  });

  it("marks a suspended association without exposing active operations", async () => {
    const html = await renderHome({ ...patientActor, roles: [Role.OSM], osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.SUSPENDED, hospitalStatus: HospitalStatus.ACTIVE }] });
    expect(html).toContain("ความสัมพันธ์ไม่พร้อมใช้งาน");
    expect(html).toContain("ยังไม่มีการดำเนินงานที่พร้อมใช้งาน");
    expect(html).not.toContain('/app/patients');
  });

  it.each([HospitalStatus.SUSPENDED, HospitalStatus.PENDING_VERIFICATION])("marks %s hospitals without active operations", async (status) => {
    const actor = staff(MembershipType.OWNER);
    const html = await renderHome({ ...actor, hospitalMemberships: actor.hospitalMemberships.map((item) => ({ ...item, hospitalStatus: status })) }, status);
    expect(html).toContain(status === HospitalStatus.SUSPENDED ? "ถูกระงับ" : "ยังไม่พร้อมใช้งาน");
    expect(html).not.toContain('/app/patients');
    expect(html).not.toContain('/app/workforce');
  });

  it("shows shared requests once while keeping multiple Hospital contexts distinct", async () => {
    const actor = staff(MembershipType.OWNER);
    const secondId = "55555555-5555-4555-8555-555555555555";
    const html = await renderHome({ ...actor, hospitalMemberships: [...actor.hospitalMemberships, { hospitalId: secondId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] });
    expect(html.match(/href="\/app\/patients\/service-requests"/g)).toHaveLength(1);
    expect(html.match(/href="\/app\/patients\/access-requests"/g)).toHaveLength(1);
    expect(html.match(/href="\/app\/patients\/service-catalog"/g)).toHaveLength(1);
    expect(html).toContain(`/app/patients?hospitalId=${hospitalId}`);
    expect(html).toContain(`/app/patients?hospitalId=${secondId}`);
    expect(html).toContain('aria-label="ไปยังบริบทโรงพยาบาล"');
    expect(html).toContain(`href="#hospital-workspace-${secondId}"`);
    expect(html).toContain(`/app/hospitals/contact?hospitalId=${secondId}`);
    expect(html).not.toContain('href="/app/patients/service-catalog?hospitalId=');
    expect(html).not.toContain('href="/app/patients/access-requests?hospitalId=');
    expect(html).not.toContain('href="/app/patients/service-requests?hospitalId=');
    expect(html.indexOf("งานผู้ป่วยในโรงพยาบาลนี้")).toBeLessThan(html.indexOf("บริหารโรงพยาบาล · สิทธิ์เจ้าของโดยตรง"));
    expect(html).not.toContain("บริหารบุคลากรโรงพยาบาลนี้</summary>");
  });

});
