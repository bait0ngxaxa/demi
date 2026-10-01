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

    expect(projection.governanceActions.map(({ href }) => href)).toEqual([
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
      `/app/workforce?hospitalId=${hospitalId}`,
      `/app/patients?hospitalId=${hospitalId}`,
      `/app/patients/provision?hospitalId=${hospitalId}`,
      `/app/patients/activation?hospitalId=${hospitalId}`,
      "/app/patients/access-requests",
      "/app/patients/service-requests",
      "/app/patients/service-catalog",
    ]);
  });

  it("does not give an ordinary Hospital member workforce management", () => {
    const projection = projectApplicationWorkspace(
      actor({
        roles: [Role.HOSPITAL],
        hospitalMemberships: [directMembership(MembershipType.MEMBER)],
      }),
      [workspace()],
    );
    const hrefs = (projection.hospitals[0]?.actions ?? []).map(({ href }) => href);

    expect(hrefs).not.toContain(`/app/workforce?hospitalId=${hospitalId}`);
    expect(hrefs).toContain(`/app/patients?hospitalId=${hospitalId}`);
    expect(hrefs).toContain(`/app/patients/provision?hospitalId=${hospitalId}`);
    expect(hrefs).toContain(`/app/patients/activation?hospitalId=${hospitalId}`);
    expect(hrefs).toContain("/app/patients/access-requests");
    expect(hrefs).toContain("/app/patients/service-requests");
    expect(hrefs).not.toContain("/app/patients/service-catalog");
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
    expect(hrefs).toEqual([`/app/patients/provision?hospitalId=${hospitalId}`]);
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
});
