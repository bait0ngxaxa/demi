import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { ActorHospitalWorkspace } from "@/modules/auth/services/actor-workspace-service";

import { projectApplicationWorkspace } from "./application-workspace";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [Role.PATIENT],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function workspace(overrides: Partial<ActorHospitalWorkspace> = {}): ActorHospitalWorkspace {
  return {
    hospitalId,
    hospitalCode: "HOSPITAL-001",
    hospitalName: "โรงพยาบาลทดสอบ",
    hospitalStatus: HospitalStatus.ACTIVE,
    network: { hospitalId, name: "โรงพยาบาลทดสอบ" },
    networkRole: null, hasActiveDirectChildren: false,
    ...overrides,
  };
}

function directMembership(membershipType: MembershipType): ActorContext["hospitalMemberships"][number] {
  return {
    hospitalId,
    membershipType,
    profession: membershipType === MembershipType.MEMBER ? Profession.NURSE : null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  };
}

describe("application workspace projection", () => {
  it("keeps Platform Admin on governance entry points", () => {
    const projection = projectApplicationWorkspace(
      actor({ roles: [Role.ADMIN] }),
      [],
    );

    // Global ADMIN selected-Hospital reporting (RPT-33) is an ADMIN governance entry point.
    expect(projection.governanceActions.map(({ href }) => href)).toEqual([
      "/app/admin/reporting",
      "/app/admin/hospitals",
      "/app/admin/hospital-onboarding",
    ]);
    expect(projection.hospitals).toHaveLength(0);
    expect(projection.assignedPatientsAction).toBeNull();
  });

  it("projects Owner actions per direct Hospital scope", () => {
    const projection = projectApplicationWorkspace(
      actor({
        roles: [Role.HOSPITAL],
        hospitalMemberships: [directMembership(MembershipType.OWNER)],
      }),
      [workspace()],
    );
    const actions = projection.hospitals[0]?.actions ?? [];

    expect(actions.map(({ href }) => href)).toEqual([
      `/app/appointments?hospitalId=${hospitalId}`,
      `/app/patients?hospitalId=${hospitalId}`,
      `/app/patients?task=service&hospitalId=${hospitalId}`,
      `/app/appointments/new?hospitalId=${hospitalId}`,
      `/app/workforce?hospitalId=${hospitalId}`,
      `/app/hospitals/content?hospitalId=${hospitalId}`,
      `/app/hospitals/contacts?hospitalId=${hospitalId}`,
      `/app/patients/provision?hospitalId=${hospitalId}`,
      `/app/patients/activation?hospitalId=${hospitalId}`,
      `/app/hospitals/contact?hospitalId=${hospitalId}`,
      `/app/hospitals/knowledge?hospitalId=${hospitalId}`,
      `/app/hospitals/reporting?hospitalId=${hospitalId}`,
    ]);
  });

  it("offers the responsibility-area overview only to the direct OWNER of a Parent with active Children (ADR-0013)", () => {
    const owner = actor({ roles: [Role.HOSPITAL], hospitalMemberships: [directMembership(MembershipType.OWNER)] });
    const member = actor({ roles: [Role.HOSPITAL], hospitalMemberships: [directMembership(MembershipType.MEMBER)] });
    const hrefs = (projectionActor: ActorContext, hasActiveDirectChildren: boolean) =>
      projectApplicationWorkspace(projectionActor, [workspace({ hasActiveDirectChildren })]).hospitals[0]?.actions.map(({ href }) => href);

    expect(hrefs(owner, true)).toContain("/app/hospitals/areas");
    expect(hrefs(owner, false)).not.toContain("/app/hospitals/areas");
    expect(hrefs(member, true)).not.toContain("/app/hospitals/areas");
  });

  it("builds work-area groups only from active direct relationships, grouped by network (STAFF-04)", () => {
    const childId = "44444444-4444-4444-8444-444444444444";
    const suspendedId = "55555555-5555-4555-8555-555555555555";
    const network = { hospitalId: "66666666-6666-4666-8666-666666666666", name: "เครือข่ายทดสอบ" };
    const projection = projectApplicationWorkspace(
      actor({
        roles: [Role.HOSPITAL, Role.OSM],
        hospitalMemberships: [{ ...directMembership(MembershipType.MEMBER), status: MembershipStatus.SUSPENDED, hospitalId: suspendedId }],
        osmHospitalRelationships: [{ hospitalId: childId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
      }),
      [
        workspace({ hospitalId: childId, hospitalName: "รพ.สต.ทดสอบ", network }),
        workspace({ hospitalId: suspendedId, hospitalName: "รพ.สต.ระงับ", network }),
      ],
    );

    expect(projection.areaGroups).toEqual([
      { network, hospitals: [{ hospitalId: childId, hospitalName: "รพ.สต.ทดสอบ" }] },
    ]);
  });

  it("gives an ordinary Hospital member only patient care", () => {
    const projection = projectApplicationWorkspace(
      actor({
        roles: [Role.HOSPITAL],
        hospitalMemberships: [directMembership(MembershipType.MEMBER)],
      }),
      [workspace()],
    );
    const hrefs = (projection.hospitals[0]?.actions ?? []).map(({ href }) => href);

    const workforceAction = (projection.hospitals[0]?.actions ?? []).find(
      ({ href }) => href === `/app/workforce?hospitalId=${hospitalId}`,
    );

    expect(workforceAction).toBeUndefined();

    expect(hrefs).toContain(`/app/patients?hospitalId=${hospitalId}`);
    expect(hrefs).toContain(`/app/patients?task=service&hospitalId=${hospitalId}`);
    expect(hrefs.some((href) => href.includes("task=screening") || href.includes("task=followup"))).toBe(false);
    expect(hrefs).toContain(`/app/appointments/new?hospitalId=${hospitalId}`);
    expect(hrefs).toContain(`/app/hospitals/content?hospitalId=${hospitalId}`);
    expect(hrefs).toContain(`/app/hospitals/contacts?hospitalId=${hospitalId}`);
    expect(hrefs).not.toContain(`/app/patients/provision?hospitalId=${hospitalId}`);
    expect(hrefs).not.toContain(`/app/patients/activation?hospitalId=${hospitalId}`);
    expect(projection.hospitals[0]?.actions.find(({ href }) => href === "/app/hospitals/reporting/export")?.category).toBe("patient");
    expect(projection.requestActions.map(({ href }) => href)).toEqual([]);
    expect(projection.supportingActions).toHaveLength(0);
  });

  it("projects only assigned-patient and permitted provisioning work for OSM", () => {
    const projection = projectApplicationWorkspace(
      actor({
        roles: [Role.OSM],
        osmHospitalRelationships: [
          {
            hospitalId,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
      [workspace()],
    );
    const hrefs = (projection.hospitals[0]?.actions ?? []).map(({ href }) => href);

    expect(projection.assignedPatientsAction?.href).toBe("/app/patients/assigned");
    expect(hrefs).toEqual([`/app/appointments?hospitalId=${hospitalId}`]);
  });

  it("keeps PATIENT landing explicit without inventing Patient data links", () => {
    const projection = projectApplicationWorkspace(actor(), []);

    expect(projection.availableWorkspaces).toEqual(["personal"]);
    expect(projection.governanceActions).toHaveLength(0);
    expect(projection.assignedPatientsAction).toBeNull();
    expect(projection.hospitals).toHaveLength(0);
  });

  it.each([
    ["OSM", [Role.OSM], ["work"]],
    ["Hospital", [Role.HOSPITAL], ["work"]],
    ["OSM and Patient", [Role.OSM, Role.PATIENT], ["personal", "work"]],
    ["Hospital and Patient", [Role.HOSPITAL, Role.PATIENT], ["personal", "work"]],
    ["Owner", [Role.HOSPITAL], ["work"]],
    ["Platform Admin", [Role.ADMIN], ["work"]],
  ] as const)("projects available workspaces for %s roles", (_label, roles, expected) => {
    const projection = projectApplicationWorkspace(actor({ roles }), []);

    expect(projection.availableWorkspaces).toEqual(expected);
  });

  it("does not project operational links for a suspended Hospital", () => {
    const projection = projectApplicationWorkspace(
      actor({
        roles: [Role.HOSPITAL],
        hospitalMemberships: [
          {
            ...directMembership(MembershipType.OWNER),
            hospitalStatus: HospitalStatus.SUSPENDED,
          },
        ],
      }),
      [workspace({ hospitalStatus: HospitalStatus.SUSPENDED })],
    );

    expect(projection.hospitals[0]).toMatchObject({
      hospitalStatus: HospitalStatus.SUSPENDED,
      actions: [],
    });
  });
  it("deduplicates actor-wide requests and tools across direct hospitals", () => {
    const secondId = "55555555-5555-4555-8555-555555555555";
    const projection = projectApplicationWorkspace(actor({
      roles: [Role.HOSPITAL, Role.PATIENT],
      hospitalMemberships: [directMembership(MembershipType.OWNER), { ...directMembership(MembershipType.OWNER), hospitalId: secondId }],
    }), [workspace(), workspace({ hospitalId: secondId })]);
    expect(projection.hospitals).toHaveLength(2);
    for (const hospital of projection.hospitals) {
      expect(hospital.actions.every(({ href }) => href === "/app/hospitals/reporting/export" || new URL(href, "https://demi.test").searchParams.get("hospitalId") === hospital.hospitalId)).toBe(true);
      expect(hospital.actions.find(({ category }) => category === "care")?.href).toBe(`/app/appointments?hospitalId=${hospital.hospitalId}`);
    }
    expect(projection.requestActions.map(({ href }) => href)).toEqual(["/app/patients/service-requests"]);
    expect(projection.supportingActions.map(({ href }) => href)).toEqual([
      "/app/patients/service-catalog",
    ]);
    expect(projection.availableWorkspaces).toEqual(["personal", "work"]);
  });

  it("keeps multiple OSM associations distinct and the assigned directory shared", () => {
    const secondId = "55555555-5555-4555-8555-555555555555";
    const projection = projectApplicationWorkspace(actor({ roles: [Role.OSM], osmHospitalRelationships: [hospitalId, secondId].map((id) => ({ hospitalId: id, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE })) }), [workspace(), workspace({ hospitalId: secondId })]);
    expect(projection.assignedPatientsAction?.href).toBe("/app/patients/assigned");
    expect(projection.hospitals.map(({ actions }) => actions.map(({ href }) => href))).toEqual([
      [`/app/appointments?hospitalId=${hospitalId}`],
      [`/app/appointments?hospitalId=${secondId}`],
    ]);
    expect(projection.requestActions).toHaveLength(0);
    expect(projection.supportingActions).toHaveLength(0);
  });

  it("denies OSM entries without an active association", () => {
    const projection = projectApplicationWorkspace(actor({ roles: [Role.OSM], osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.SUSPENDED, hospitalStatus: HospitalStatus.ACTIVE }] }), [workspace()]);
    expect(projection.assignedPatientsAction).toBeNull();
    expect(projection.hospitals[0]?.actions).toEqual([]);
    expect(projection.hospitals[0]?.contextLabel).toContain("ความสัมพันธ์ไม่พร้อมใช้งาน");
    expect(projectApplicationWorkspace(actor({ roles: [Role.OSM] }), []).hospitals).toEqual([]);
  });

  it("does not grant Work operations from Patient self access or unrelated workspace data", () => {
    const projection = projectApplicationWorkspace(actor(), [workspace()]);
    expect(projection.hospitals[0]?.actions).toEqual([]);
    expect(projection.requestActions).toEqual([]);
    expect(projection.supportingActions).toEqual([]);
  });

  it("keeps OWNER of A and MEMBER of B management separate", () => {
    const secondId = "55555555-5555-4555-8555-555555555555";
    const projection = projectApplicationWorkspace(actor({
      roles: [Role.HOSPITAL, Role.OSM, Role.PATIENT],
      hospitalMemberships: [directMembership(MembershipType.OWNER), { ...directMembership(MembershipType.MEMBER), hospitalId: secondId }],
      osmHospitalRelationships: [{ hospitalId: secondId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    }), [workspace(), workspace({ hospitalId: secondId })]);
    expect(projection.hospitals[0]?.actions.filter(({ category }) => category === "administration")).toHaveLength(4);
    expect(
      projection.hospitals[1]?.actions
        .filter(({ category }) => category === "administration")
        .map(({ href }) => href),
    ).toEqual([]);
    expect(projection.hospitals[1]?.actions.find(({ category }) => category === "care")?.href).toBe(`/app/appointments?hospitalId=${secondId}`);
    expect(projection.assignedPatientsAction?.href).toBe("/app/patients/assigned");
    expect(projection.hospitals[1]?.contextLabel).toContain("สมาชิกโรงพยาบาล");
    expect(projection.hospitals[1]?.contextLabel).not.toContain("เจ้าของโรงพยาบาล");
  });

  it("preserves domain-specific ADMIN + HOSPITAL policies", () => {
    const projection = projectApplicationWorkspace(actor({ roles: [Role.ADMIN, Role.HOSPITAL], hospitalMemberships: [directMembership(MembershipType.OWNER)] }), [workspace()]);
    expect(projection.governanceActions).toHaveLength(3);
    expect(projection.hospitals[0]?.actions.filter(({ category }) => category === "administration")).toHaveLength(4);
    // Request and catalog policies explicitly exclude actors holding ADMIN, even with direct membership.
    expect(projection.requestActions).toEqual([]);
    expect(projection.supportingActions).toEqual([]);
  });

  it.each([MembershipStatus.SUSPENDED, MembershipStatus.PROVISIONED, MembershipStatus.INVITED])("keeps %s memberships visible without operational or management actions", (status) => {
    const projection = projectApplicationWorkspace(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [{ ...directMembership(MembershipType.OWNER), status }] }), [workspace()]);
    expect(projection.hospitals[0]?.contextLabel).toContain("สมาชิกไม่พร้อมใช้งาน");
    expect(projection.hospitals[0]?.actions).toEqual([]);
    expect(projection.requestActions).toEqual([]);
    expect(projection.supportingActions).toEqual([]);
  });

  it("does not project OWNER tools for unrelated Hospital identifiers or ADMIN-only membership data", () => {
    const scopedActor = actor({ roles: [Role.HOSPITAL], hospitalMemberships: [directMembership(MembershipType.OWNER)] });
    expect(projectApplicationWorkspace(scopedActor, [workspace({ hospitalId: "foreign-hospital" })]).hospitals[0]?.actions).toEqual([]);
    expect(projectApplicationWorkspace({ ...scopedActor, roles: [Role.ADMIN] }, [workspace()]).hospitals[0]?.actions).toEqual([]);
  });

});
