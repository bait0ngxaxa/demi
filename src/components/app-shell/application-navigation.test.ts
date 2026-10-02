import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import { projectApplicationNavigation } from "./application-navigation";
import { isNavigationItemActive } from "./navigation-state";

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

function navigationLabels(context: ActorContext): string[] {
  return projectApplicationNavigation(context).flatMap((group) => [
    ...(group.label ? [group.label] : []),
    ...group.items.map((item) => item.label),
  ]);
}

describe("application navigation projection", () => {
  it("shows Platform Admin navigation only to ADMIN", () => {
    const adminLabels = navigationLabels(actor({ roles: [Role.ADMIN] }));
    const hospitalLabels = navigationLabels(actor({ roles: [Role.HOSPITAL] }));

    expect(adminLabels).toContain("ผู้ดูแลระบบ");
    expect(adminLabels).toContain("การกำกับดูแลโรงพยาบาล");
    expect(adminLabels).toContain("คำขอขึ้นทะเบียนโรงพยาบาล");
    expect(hospitalLabels).not.toContain("ผู้ดูแลระบบ");
  });

  it("offers the shared Family management route to active actor types without granting authority", () => {
    for (const roles of [[Role.HOSPITAL], [Role.OSM], [Role.PATIENT], [Role.ADMIN]] as const) {
      const familyItem = projectApplicationNavigation(actor({ roles }))
        .flatMap((group) => group.items)
        .find(({ href }) => href === "/app/family");

      expect(familyItem?.label).toBe("ความสัมพันธ์ผู้ดูแล");
    }
  });

  it("shows Patient provisioning and activation for a valid direct Hospital scope", () => {
    const labels = navigationLabels(
      actor({
        roles: [Role.HOSPITAL],
        hospitalMemberships: [
          {
            hospitalId,
            membershipType: MembershipType.MEMBER,
            profession: Profession.NURSE,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
    );

    expect(labels).toContain("เพิ่ม / นำเข้าผู้ป่วย");
    expect(labels).toContain("เปิดใช้งานบัญชีผู้ป่วย");
    expect(labels).toContain("รายชื่อผู้ป่วย");
    expect(labels).toContain("คำขอเปิดใช้งานผู้ป่วย");
    expect(labels).toContain("คำขอบริการผู้ป่วย");
    expect(labels).not.toContain("บริการที่ผู้ป่วยขอได้");
    expect(labels).not.toContain("จัดการบุคลากร");
  });

  it("shows the service catalog only to an exact active Hospital owner", () => {
    const ownerLabels = navigationLabels(
      actor({
        roles: [Role.HOSPITAL],
        hospitalMemberships: [
          {
            hospitalId,
            membershipType: MembershipType.OWNER,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
    );
    const adminLabels = navigationLabels(
      actor({
        roles: [Role.ADMIN, Role.HOSPITAL],
        hospitalMemberships: [
          {
            hospitalId,
            membershipType: MembershipType.OWNER,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
    );

    expect(ownerLabels).toContain("บริการที่ผู้ป่วยขอได้");
    expect(adminLabels).not.toContain("บริการที่ผู้ป่วยขอได้");
    expect(adminLabels).not.toContain("คำขอเปิดใช้งานผู้ป่วย");
    expect(adminLabels).not.toContain("คำขอบริการผู้ป่วย");
  });

  it("shows Workforce navigation for an active Hospital owner", () => {
    const labels = navigationLabels(
      actor({
        roles: [Role.HOSPITAL],
        hospitalMemberships: [
          {
            hospitalId,
            membershipType: MembershipType.OWNER,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
    );

    expect(labels).toContain("จัดการบุคลากร");
  });

  it("does not grant Hospital-only activation navigation to an OSM provisioning actor", () => {
    const labels = navigationLabels(
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
    );

    expect(labels).toContain("เพิ่ม / นำเข้าผู้ป่วย");
    expect(labels).not.toContain("รายชื่อผู้ป่วย");
    expect(labels).toContain("ผู้ป่วยที่รับผิดชอบ");
    expect(labels).not.toContain("เปิดใช้งานบัญชีผู้ป่วย");
  });

  it("does not show assigned Patient navigation without an active OSM Hospital relationship", () => {
    const labels = navigationLabels(
      actor({
        roles: [Role.OSM],
        osmHospitalRelationships: [
          {
            hospitalId,
            status: MembershipStatus.SUSPENDED,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
    );

    expect(labels).not.toContain("ผู้ป่วยที่รับผิดชอบ");
  });

  it("does not show Patient Directory navigation to Platform ADMIN", () => {
    const labels = navigationLabels(actor({ roles: [Role.ADMIN] }));

    expect(labels).not.toContain("รายชื่อผู้ป่วย");
  });

  it("omits unavailable groups instead of rendering them empty", () => {
    const navigation = projectApplicationNavigation(actor());

    expect(navigation).toHaveLength(2);
    expect(navigation.every((group) => group.items.length > 0)).toBe(true);
    expect(navigation[0].workspace).toBe("personal");
    expect(navigation[0].items.map(({ href }) => href)).toEqual([
      "/app/personal",
      "/app/personal/care",
      "/app/personal/services",
      "/app/personal/medications",
      "/app/personal/appointments",
      "/app/personal/profile",
    ]);
    expect(navigation[1].items.map(({ href }) => href)).toEqual(["/app/family"]);
  });

  it.each([
    ["OSM", [Role.OSM]],
    ["Hospital", [Role.HOSPITAL]],
  ] as const)("keeps %s in the Work context", (_label, roles) => {
    const navigation = projectApplicationNavigation(actor({ roles }));

    expect(navigation[0].workspace).toBe("work");
    expect(navigation.flatMap(({ items }) => items).map(({ href }) => href)).toContain("/app");
    expect(navigation.flatMap(({ items }) => items).map(({ href }) => href)).not.toContain(
      "/app/personal",
    );
    expect(navigation.flatMap(({ items }) => items).map(({ href }) => href)).not.toContain(
      "/app/personal/medications",
    );
  });

  it.each([
    ["OSM and Patient", [Role.OSM, Role.PATIENT]],
    ["Hospital and Patient", [Role.HOSPITAL, Role.PATIENT]],
  ] as const)("projects Personal and Work navigation for %s", (_label, roles) => {
    const navigation = projectApplicationNavigation(actor({ roles }));
    const workspaceItems = navigation
      .filter(({ workspace }) => workspace === "all")
      .flatMap(({ items }) => items);

    expect(workspaceItems.map(({ href }) => href)).toEqual(["/app/personal", "/app"]);
    expect(navigation.some(({ workspace }) => workspace === "personal")).toBe(true);
    expect(navigation.some(({ workspace }) => workspace === "work")).toBe(true);
    const personalItems = navigation
      .filter(({ workspace }) => workspace === "personal")
      .flatMap(({ items }) => items);
    expect(personalItems.map(({ href }) => href)).toContain("/app/personal/care");
    expect(personalItems.map(({ href }) => href)).toContain("/app/personal/services");
    expect(personalItems.map(({ href }) => href)).toContain("/app/personal/appointments");
    expect(personalItems.map(({ href }) => href)).not.toContain("/app/patients/assigned");
  });

  it("does not project Personal navigation from an OSM or Hospital role alone", () => {
    const navigation = projectApplicationNavigation(
      actor({
        roles: [Role.HOSPITAL, Role.OSM],
        hospitalMemberships: [
          {
            hospitalId,
            membershipType: MembershipType.MEMBER,
            profession: Profession.NURSE,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
    );

    expect(navigation.flatMap(({ items }) => items).map(({ href }) => href)).not.toContain(
      "/app/personal",
    );
  });
});

describe("application navigation active state", () => {
  it("matches the dashboard exactly and nested feature routes by prefix", () => {
    expect(
      isNavigationItemActive("/app/workforce", {
        href: "/app",
        label: "หน้าหลัก",
        match: "exact",
      }),
    ).toBe(false);
    expect(
      isNavigationItemActive("/app/admin/hospital-onboarding/request-id", {
        href: "/app/admin/hospital-onboarding",
        label: "คำขอขึ้นทะเบียนโรงพยาบาล",
        match: "prefix",
      }),
    ).toBe(true);
  });
});
