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
    expect(adminLabels).toContain("คำขอขึ้นทะเบียนโรงพยาบาล");
    expect(hospitalLabels).not.toContain("ผู้ดูแลระบบ");
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
    expect(labels).not.toContain("จัดการบุคลากร");
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
    expect(labels).not.toContain("เปิดใช้งานบัญชีผู้ป่วย");
  });

  it("omits unavailable groups instead of rendering them empty", () => {
    const navigation = projectApplicationNavigation(actor());

    expect(navigation).toHaveLength(1);
    expect(navigation.every((group) => group.items.length > 0)).toBe(true);
    expect(navigation[0].items[0].label).toBe("หน้าหลัก");
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
