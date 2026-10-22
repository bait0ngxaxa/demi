import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";

import ApplicationPage from "./page";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listActorHospitalWorkspaces } from "@/modules/auth/services/actor-workspace-service";
import { listHospitalWorkContent } from "@/modules/hospital-content/services/hospital-content-work-query-service";
import { listChildOwnerInvitationsForActor } from "@/modules/hospital-service-areas/services/child-facility-service";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

const { mockedRedirect } = vi.hoisted(() => ({ mockedRedirect: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ redirect: mockedRedirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("@/modules/auth/services/actor-workspace-service", () => ({
  listActorHospitalWorkspaces: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/hospital-content/services/hospital-content-work-query-service", () => ({
  listHospitalWorkContent: vi.fn(),
}));

vi.mock("@/modules/hospital-service-areas/services/child-facility-service", () => ({
  listChildOwnerInvitationsForActor: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/hospital-service-areas/transport/server-actions", () => ({
  acceptChildOwnerInvitationAction: vi.fn(),
  declineChildOwnerInvitationAction: vi.fn(),
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
    vi.mocked(listHospitalWorkContent).mockResolvedValue({ items: [], nextCursor: null });
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("sends a Patient-only account to Personal Home", async () => {
    await expect(ApplicationPage()).rejects.toThrow("NEXT_REDIRECT:/app/personal");
    expect(mockedRedirect).toHaveBeenCalledWith("/app/personal");
    expect(scheduleCurrentLineAccountReconciliation).not.toHaveBeenCalled();
  });

  it("keeps a Patient-only account with a pending Child OWNER invitation on this page to answer it (ADR-0018)", async () => {
    vi.mocked(listChildOwnerInvitationsForActor).mockResolvedValueOnce([{
      membershipId: "44444444-4444-4444-8444-444444444444",
      child: { id: "55555555-5555-4555-8555-555555555555", hospitalCode: "H-ABCDEF", name: "รพ.สต.บ้านใหม่" },
      parent: { id: "66666666-6666-4666-8666-666666666666", hospitalCode: "PARENT", name: "โรงพยาบาลแม่ข่าย" },
      invitedAt: new Date("2026-10-21T00:00:00.000Z"),
    }]);

    const markup = renderToStaticMarkup(await ApplicationPage());

    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(markup).toContain("คำเชิญเป็นผู้ดูแล รพ.สต.บ้านใหม่");
    expect(markup).toContain("จาก โรงพยาบาลแม่ข่าย (แม่ข่าย)");
    expect(markup).toContain("ตอบรับ");
    expect(markup).toContain("ปฏิเสธ");
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
  async function renderHome(actor: ActorContext, status: HospitalStatus = HospitalStatus.ACTIVE, query: Record<string, string> = {}): Promise<string> {
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(actor);
    vi.mocked(listActorHospitalWorkspaces).mockResolvedValue(
      [...new Set([...actor.hospitalMemberships, ...actor.osmHospitalRelationships].map(({ hospitalId }) => hospitalId))].map((hospitalId) => ({ hospitalId, hospitalName: `โรงพยาบาล ${hospitalId}`, hospitalCode: hospitalId, hospitalStatus: status, network: { hospitalId, name: `โรงพยาบาล ${hospitalId}` }, networkRole: null, hasActiveDirectChildren: false })),
    );
    return renderToStaticMarkup(await ApplicationPage({ searchParams: Promise.resolve(query) }));
  }

  /** Markup of one `<section aria-labelledby=...>` (home sections do not nest). */
  function section(html: string, headingId: string): string {
    const start = html.indexOf(`<section aria-labelledby="${headingId}"`);
    return start === -1 ? "" : html.slice(start, html.indexOf("</section>", start));
  }

  const hospitalId = "44444444-4444-4444-8444-444444444444";
  function staff(membershipType: MembershipType, roles: readonly Role[] = [Role.HOSPITAL]): ActorContext {
    return { ...patientActor, roles, hospitalMemberships: [{ hospitalId, membershipType, profession: Profession.NURSE, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] };
  }

  it("prioritizes patient care and keeps direct administration for OWNER", async () => {
    const type = MembershipType.OWNER;
    const html = await renderHome(staff(type));
    expect(html).toContain(`/app/patients?hospitalId=${hospitalId}`);
    expect(html.indexOf(`/app/patients?hospitalId=${hospitalId}`)).toBeLessThan(html.indexOf("ข้อมูลบัญชีและสิทธิ์"));
    expect(html).toContain(`/app/patients/provision?hospitalId=${hospitalId}`);
    expect(html).toContain(`/app/patients/activation?hospitalId=${hospitalId}`);
    expect(html).toContain('href="/app/patients/service-requests"');
    expect(html).not.toContain('/app/patients/access-requests');
    expect(html).toContain("ไม่จำกัดเฉพาะโรงพยาบาลที่เลือก");
    expect(section(html, "work-home-menu-heading")).toContain(`/app/workforce?hospitalId=${hospitalId}`);
    expect(html).not.toContain("สมาชิกเพิ่มและดูแลการเปิดใช้งานบัญชี อสม. ได้เท่านั้น");
    expect(html).toContain("เครื่องมือแสดงตามสิทธิ์ของคุณในโรงพยาบาลนี้");
    // The hero is the first care action of the selected Hospital, as a link without counts.
    expect(section(html, "work-home-heading")).toContain(`href="/app/patients?hospitalId=${hospitalId}"`);
    expect(html.includes('href="/app/patients/service-catalog"')).toBe(type === MembershipType.OWNER);
    for (const path of ["contact", "knowledge", "reporting"]) {
      expect(html.includes(`href="/app/hospitals/${path}?hospitalId=${hospitalId}"`)).toBe(type === MembershipType.OWNER);
    }
    expect(html.includes("บริหารโรงพยาบาล · สิทธิ์เจ้าของโดยตรง")).toBe(type === MembershipType.OWNER);
    expect(html).not.toContain("จัดการ อสม. · สิทธิ์สมาชิกโดยตรง");
    expect(scheduleCurrentLineAccountReconciliation).toHaveBeenCalledOnce();
    expect(html).not.toMatch(/งานถัดไป|งานค้าง|วันนี้|เปอร์เซ็นต์/);
    expect(html).toContain("focus-visible:ring-focus-ring");
    expect(html).toContain('aria-labelledby="work-home-menu-heading"');
    // Cross-hospital actions are rows outside the Hospital grid.
    const grid = section(html, "work-home-menu-heading");
    for (const shared of ["/app/patients/service-requests", "/app/patients/access-requests", "/app/patients/service-catalog"]) {
      expect(grid).not.toContain(shared);
    }
    expect(section(html, "work-home-shared-heading")).toContain('href="/app/patients/service-requests"');
    expect(html).toContain("การเลือกโรงพยาบาลไม่เพิ่มสิทธิ์ให้บัญชี");
  });

  // ADR-0019: import, activation, workforce and request review are OWNER-only; every MEMBER may
  // still export reports (Product Owner decision 2026-10-21).
  it("shows a MEMBER patient care and report export, without OWNER administration or request review", async () => {
    const html = await renderHome(staff(MembershipType.MEMBER));
    expect(section(html, "work-home-heading")).toContain(`href="/app/patients?hospitalId=${hospitalId}"`);
    expect(section(html, "work-home-menu-heading")).toContain(`href="/app/patients?hospitalId=${hospitalId}"`);
    for (const ownerOnly of ["/app/patients/provision", "/app/patients/activation", "/app/workforce", "/app/patients/service-requests", "/app/patients/access-requests", "/app/patients/service-catalog", `/app/hospitals/reporting?hospitalId=${hospitalId}`]) {
      expect(html).not.toContain(ownerOnly);
    }
    expect(section(html, "work-home-shared-heading")).toContain('href="/app/hospitals/reporting/export"');
    expect(html).not.toContain("จัดการ อสม. · สิทธิ์สมาชิกโดยตรง");
    expect(html).not.toContain("บริหารโรงพยาบาล · สิทธิ์เจ้าของโดยตรง");
    expect(html).toContain("การเลือกโรงพยาบาลไม่เพิ่มสิทธิ์ให้บัญชี");
  });

  it("shows OSM assigned care first without general directory or bulk import", async () => {
    const html = await renderHome({ ...patientActor, roles: [Role.OSM], osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] });
    expect(html).toContain('href="/app/patients/assigned"');
    expect(html).not.toContain("/app/patients/provision");
    expect(section(html, "work-home-heading")).toContain('href="/app/patients/assigned"');
    const grid = section(html, "work-home-menu-heading");
    expect(grid).toContain(`href="/app/patients/assigned?task=screening&amp;hospitalId=${hospitalId}"`);
    expect(grid).toContain(`href="/app/patients/assigned?task=followup&amp;hospitalId=${hospitalId}"`);
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
    expect(html).toContain("ระบบ DEMI ทั้งหมด");
    expect(section(html, "work-home-heading")).toContain('href="/app/admin/reporting"');
    expect(section(html, "work-home-menu-heading")).toContain('href="/app/admin/hospital-onboarding"');
    expect(html).not.toContain('/app/patients');
    expect(html).not.toContain('id="work-home-news-heading"');
    expect(html).not.toContain('id="work-home-shared-heading"');
    expect(listHospitalWorkContent).not.toHaveBeenCalled();
    expect(html.indexOf('href="/app/admin/reporting"')).toBeLessThan(html.indexOf("ข้อมูลบัญชีและสิทธิ์"));
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
    expect(html).not.toContain('/app/patients/access-requests');
    expect(html.match(/href="\/app\/patients\/service-catalog"/g)).toHaveLength(1);
    // The grid shows only the selected (default: first) Hospital; the other is a chip option.
    expect(html).toContain(`/app/patients?hospitalId=${hospitalId}`);
    expect(html).not.toContain(`/app/patients?hospitalId=${secondId}`);
    expect(html).toContain('id="work-home-hospital"');
    expect(html).toContain('name="hospitalId"');
    expect(html).toContain(`value="${secondId}"`);
    expect(html).not.toContain('href="/app/patients/service-catalog?hospitalId=');
    expect(html).not.toContain('href="/app/patients/access-requests?hospitalId=');
    expect(html).not.toContain('href="/app/patients/service-requests?hospitalId=');
    expect(html.indexOf('id="work-home-menu-heading"')).toBeLessThan(html.indexOf('id="work-home-shared-heading"'));
    expect(html).not.toContain("บริหารบุคลากรโรงพยาบาลนี้</summary>");

    vi.mocked(listHospitalWorkContent).mockClear();
    const second = await renderHome({ ...actor, hospitalMemberships: [...actor.hospitalMemberships, { hospitalId: secondId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] }, HospitalStatus.ACTIVE, { hospitalId: secondId });
    expect(second).toContain(`/app/patients?hospitalId=${secondId}`);
    expect(second).toContain(`/app/hospitals/contact?hospitalId=${secondId}`);
    expect(second).not.toContain(`/app/patients?hospitalId=${hospitalId}`);
    expect(second).toContain(`value="${secondId}" selected=""`);
    expect(second.match(/href="\/app\/patients\/service-requests"/g)).toHaveLength(1);
    expect(listHospitalWorkContent).toHaveBeenCalledWith(expect.anything(), { hospitalId: secondId, limit: 3 });
  });

  describe("STAFF-04 responsibility-area selector (ADR-0013 §2)", () => {
    const parentId = "66666666-6666-4666-8666-666666666666";
    const childId = "77777777-7777-4777-8777-777777777777";
    const otherChildId = "88888888-8888-4888-8888-888888888888";
    const membership = (id: string, membershipType = MembershipType.MEMBER, status: MembershipStatus = MembershipStatus.ACTIVE) => ({
      hospitalId: id, membershipType, profession: Profession.NURSE, status, hospitalStatus: HospitalStatus.ACTIVE,
    });
    function mockWorkspaces(entries: readonly { id: string; name: string; network: { hospitalId: string; name: string } }[]): void {
      vi.mocked(listActorHospitalWorkspaces).mockResolvedValue(entries.map(({ id, name, network }) => ({
        hospitalId: id, hospitalName: name, hospitalCode: id, hospitalStatus: HospitalStatus.ACTIVE, network, networkRole: null, hasActiveDirectChildren: false,
      })));
    }
    const parentNetwork = { hospitalId: parentId, name: "รพ.แม่ข่ายสังเคราะห์" };

    it("groups direct work contexts under their parent network", async () => {
      const actor: ActorContext = { ...patientActor, roles: [Role.HOSPITAL, Role.OSM], hospitalMemberships: [membership(childId)], osmHospitalRelationships: [{ hospitalId: otherChildId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] };
      vi.mocked(getProtectedApplicationActor).mockResolvedValue(actor);
      mockWorkspaces([
        { id: childId, name: "รพ.สต.ลูกข่ายหนึ่ง", network: parentNetwork },
        { id: otherChildId, name: "รพ.สต.ลูกข่ายสอง", network: parentNetwork },
      ]);
      const html = renderToStaticMarkup(await ApplicationPage());
      expect(html.match(/<optgroup label="เครือข่าย รพ\.แม่ข่ายสังเคราะห์">/g)).toHaveLength(1);
      expect(html).toContain(`value="${childId}"`);
      expect(html).toContain(`value="${otherChildId}"`);
    });

    it("never lists a Child for a Parent-only member and excludes inactive direct relationships", async () => {
      const actor: ActorContext = { ...patientActor, roles: [Role.HOSPITAL], hospitalMemberships: [membership(parentId), membership(otherChildId, MembershipType.MEMBER, MembershipStatus.SUSPENDED)] };
      vi.mocked(getProtectedApplicationActor).mockResolvedValue(actor);
      mockWorkspaces([
        { id: parentId, name: "รพ.แม่ข่ายสังเคราะห์", network: parentNetwork },
        { id: otherChildId, name: "รพ.สต.ลูกข่ายสอง", network: parentNetwork },
      ]);
      const html = renderToStaticMarkup(await ApplicationPage());
      // One active direct context only: the selector stays hidden, as for any single-Hospital user.
      expect(html).not.toContain('id="work-home-hospital"');
      expect(html).not.toContain(childId);
      expect(html).not.toContain(`hospitalId=${otherChildId}`);
    });

    it("keeps the single-Hospital home unchanged (no selector)", async () => {
      const html = await renderHome(staff(MembershipType.OWNER));
      expect(html).not.toContain('id="work-home-hospital"');
      expect(html).toContain(`/app/patients?hospitalId=${hospitalId}`);
    });
  });

  describe("UI-3 Hospital selection and team news", () => {
    const secondId = "55555555-5555-4555-8555-555555555555";
    const parentId = "66666666-6666-4666-8666-666666666666";
    const childId = "77777777-7777-4777-8777-777777777777";
    const member = (id: string, status: MembershipStatus = MembershipStatus.ACTIVE) => ({
      hospitalId: id, membershipType: MembershipType.MEMBER, profession: Profession.NURSE, status, hospitalStatus: HospitalStatus.ACTIVE,
    });
    const forgedActor: ActorContext = {
      ...patientActor,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [member(hospitalId), member(parentId), member(secondId, MembershipStatus.SUSPENDED)],
    };

    function mockForgedWorkspaces(): void {
      vi.mocked(getProtectedApplicationActor).mockResolvedValue(forgedActor);
      vi.mocked(listActorHospitalWorkspaces).mockResolvedValue([hospitalId, parentId, secondId, childId].map((id) => ({
        hospitalId: id,
        hospitalName: `โรงพยาบาล ${id.slice(0, 4)}`,
        hospitalCode: id,
        hospitalStatus: HospitalStatus.ACTIVE,
        network: id === childId ? { hospitalId: parentId, name: "เครือข่ายแม่ข่าย" } : { hospitalId: id, name: `เครือข่าย ${id.slice(0, 4)}` },
        networkRole: null, hasActiveDirectChildren: false,
      })));
    }

    it.each([
      ["a Hospital without any relationship", "99999999-9999-4999-8999-999999999999"],
      ["a Child reached only through a Parent membership", childId],
      ["an inactive direct membership", secondId],
      ["a repeated parameter", [parentId, parentId]],
    ])("falls back to the default Hospital for a forged hospitalId: %s", async (_label, forged) => {
      mockForgedWorkspaces();
      const html = renderToStaticMarkup(await ApplicationPage({ searchParams: Promise.resolve({ hospitalId: forged }) }));

      // The default is the first candidate in network order (เครือข่าย 4444 before เครือข่าย 6666).
      expect(html).toContain(`value="${hospitalId}" selected=""`);
      expect(section(html, "work-home-menu-heading")).toContain(`/app/patients?hospitalId=${hospitalId}`);
      expect(html).not.toContain(`hospitalId=${childId}`);
      expect(html).not.toContain(`hospitalId=${secondId}`);
      expect(listHospitalWorkContent).toHaveBeenCalledWith(forgedActor, { hospitalId, limit: 3 });
    });

    it("selects a valid direct work area and lists the other non-selectable Hospitals with status only", async () => {
      mockForgedWorkspaces();
      const html = renderToStaticMarkup(await ApplicationPage({ searchParams: Promise.resolve({ hospitalId: parentId.toUpperCase() }) }));

      expect(html).toContain(`value="${parentId}" selected=""`);
      expect(section(html, "work-home-menu-heading")).toContain(`/app/patients?hospitalId=${parentId}`);
      expect(section(html, "work-home-menu-heading")).not.toContain(`/app/patients?hospitalId=${hospitalId}`);
      const unavailable = section(html, "work-home-unavailable-heading");
      expect(unavailable).toContain("โรงพยาบาล 5555");
      expect(unavailable).toContain("(สมาชิกไม่พร้อมใช้งาน)");
      expect(unavailable).not.toContain("href=");
      expect(listHospitalWorkContent).toHaveBeenCalledWith(forgedActor, { hospitalId: parentId, limit: 3 });
    });

    it("shows the latest team news of the selected Hospital with a filtered 'ดูทั้งหมด' link", async () => {
      vi.mocked(listHospitalWorkContent).mockResolvedValue({
        items: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "ประชุมทีม <อสม.>", category: "NEWS", latestPublishedAt: "2026-10-19T03:00:00.000Z", imageIds: [], hospital: { hospitalCode: hospitalId, name: "โรงพยาบาลทดสอบ" } }],
        nextCursor: "next",
      });
      const html = await renderHome(staff(MembershipType.MEMBER));
      const news = section(html, "work-home-news-heading");

      expect(news).toContain('href="/app/hospitals/content/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
      expect(news).toContain("ประชุมทีม &lt;อสม.&gt;");
      expect(news).toContain(`href="/app/hospitals/content?hospitalId=${hospitalId}"`);
      expect(listHospitalWorkContent).toHaveBeenCalledWith(expect.anything(), { hospitalId, limit: 3 });
    });

    it("keeps an empty team news state and the workspace switch for OSM + Patient", async () => {
      const html = await renderHome({ ...patientActor, roles: [Role.OSM, Role.PATIENT], osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] });

      expect(section(html, "work-home-news-heading")).toContain(`ยังไม่มีข่าวสารสำหรับทีมงานจากโรงพยาบาล ${hospitalId}`);
      expect(section(html, "work-home-heading")).toContain('href="/app/personal"');
      expect(section(html, "work-home-heading")).toContain('href="/app/patients/assigned"');
    });

    it("stays usable at 320px: labelled controls, four-column wrapping grid and no fixed widths", async () => {
      const actor = staff(MembershipType.OWNER);
      const html = await renderHome({ ...actor, hospitalMemberships: [...actor.hospitalMemberships, { ...actor.hospitalMemberships[0]!, hospitalId: secondId }] });

      expect(html).toContain('<label class="mb-1 block text-xs font-medium text-white/80" for="work-home-hospital">');
      expect(section(html, "work-home-menu-heading")).toContain("grid min-w-0 grid-cols-4");
      expect(section(html, "work-home-menu-heading")).toContain("min-h-20");
      expect(html).toContain('class="content-workspace min-w-0 break-words"');
      expect(html).not.toMatch(/\bw-\[\d+px\]|min-w-\[\d+px\]/u);
    });
  });

  describe("UI-3.1 review fixes", () => {
    const secondId = "55555555-5555-4555-8555-555555555555";
    const osmAt = (...ids: string[]): ActorContext => ({
      ...patientActor,
      roles: [Role.OSM, Role.PATIENT],
      osmHospitalRelationships: ids.map((id) => ({ hospitalId: id, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE })),
    });

    it("scopes OSM task tiles to the selected Hospital for a multi-Hospital OSM", async () => {
      const grid = section(await renderHome(osmAt(hospitalId, secondId), HospitalStatus.ACTIVE, { hospitalId: secondId }), "work-home-menu-heading");

      expect(grid).toContain(`href="/app/patients/assigned?task=screening&amp;hospitalId=${secondId}"`);
      expect(grid).toContain(`href="/app/patients/assigned?task=followup&amp;hospitalId=${secondId}"`);
      expect(grid).not.toContain(hospitalId);
    });

    it("uses a focus ring that reaches 3:1 on brand-deep for every focusable hero element", async () => {
      const hero = section(await renderHome(osmAt(hospitalId, secondId)), "work-home-heading");

      expect(hero).toContain("<select");
      expect(hero).toContain('type="submit"');
      expect(hero).toContain('href="/app/personal"');
      expect(hero.match(/focus-visible:ring-brand-bright/gu)).toHaveLength(4);
      expect(hero).not.toContain("ring-focus-ring");
    });

    it("keeps the hero and grid when the team news feed fails, with a retry link to the same Hospital", async () => {
      vi.mocked(listHospitalWorkContent).mockRejectedValue(new InfrastructureError("feed down"));
      const html = await renderHome(staff(MembershipType.OWNER));
      const news = section(html, "work-home-news-heading");

      expect(news).toContain("โหลดข่าวสารไม่สำเร็จ");
      expect(news).toContain(`href="/app?hospitalId=${hospitalId}"`);
      expect(section(html, "work-home-heading")).toContain(`href="/app/patients?hospitalId=${hospitalId}"`);
      expect(section(html, "work-home-menu-heading")).toContain(`/app/workforce?hospitalId=${hospitalId}`);
      expect(section(html, "work-home-shared-heading")).toContain('href="/app/patients/service-requests"');
    });

    it("does not swallow an authorization error from the team news feed", async () => {
      vi.mocked(listHospitalWorkContent).mockRejectedValue(new ForbiddenError());

      await expect(renderHome(staff(MembershipType.OWNER))).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
