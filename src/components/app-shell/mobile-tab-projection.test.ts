import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import { projectApplicationNavigation as projectNavigation } from "./application-navigation";
import { resolveActiveMobileTabId } from "./mobile-navigation-state";
import { projectMobileNavigation, projectMoreNavigation } from "./mobile-tab-projection";
import type { ApplicationNavigationGroup, ApplicationWorkspaceContext } from "./navigation-types";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const operationalRoles = [Role.PATIENT, Role.OSM, Role.HOSPITAL, Role.ADMIN] as const;
const roleCombinations = Array.from({ length: (1 << operationalRoles.length) - 1 }, (_, index) =>
  operationalRoles.filter((_, roleIndex) => ((index + 1) & (1 << roleIndex)) !== 0),
);
const multiRoleCombinations = roleCombinations.filter((roles) => roles.length > 1);

function actor(
  roles: readonly Role[],
  options: {
    osmStatus?: MembershipStatus;
    hospitalStatus?: HospitalStatus;
    includeOsmScope?: boolean;
    includeHospitalScope?: boolean;
  } = {},
): ActorContext {
  const hasOsm = roles.includes(Role.OSM);
  const hasHospital = roles.includes(Role.HOSPITAL);

  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [...roles],
    hospitalMemberships: hasHospital && options.includeHospitalScope !== false
      ? [
          {
            hospitalId,
            membershipType: MembershipType.OWNER,
            profession: Profession.DOCTOR,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: options.hospitalStatus ?? HospitalStatus.ACTIVE,
          },
        ]
      : [],
    osmHospitalRelationships: hasOsm && options.includeOsmScope !== false
      ? [
          {
            hospitalId,
            status: options.osmStatus ?? MembershipStatus.ACTIVE,
            hospitalStatus: options.hospitalStatus ?? HospitalStatus.ACTIVE,
          },
        ]
      : [],
  };
}

/** Hospital workspaces only gate the areas entry, which these tab tests do not exercise. */
function projectApplicationNavigation(
  subject: ActorContext,
  awaitingOsmAcceptanceCount = 0,
): readonly ApplicationNavigationGroup[] {
  return projectNavigation(subject, [], awaitingOsmAcceptanceCount);
}

function hrefs(groups: readonly ApplicationNavigationGroup[]): string[] {
  return groups.flatMap(({ items }) => items.map(({ href }) => href));
}

function primaryTabs(
  navigation: readonly ApplicationNavigationGroup[],
  workspace: ApplicationWorkspaceContext,
) {
  return projectMobileNavigation(navigation).tabsByWorkspace[workspace];
}

describe("server-projected mobile navigation", () => {
  it("uses the customer bottom menu verbatim for Patient-only and Patient plus Work roles", () => {
    const patient = projectApplicationNavigation(actor([Role.PATIENT]));
    const patientOsm = projectApplicationNavigation(actor([Role.PATIENT, Role.OSM]));
    const patientOwner = projectApplicationNavigation(actor([Role.PATIENT, Role.HOSPITAL]));
    const expectedIds = ["home", "health", "appointments", "followup", "more"];
    const expectedLabels = ["หน้าหลัก", "ข้อมูลสุขภาพ", "นัดหมาย", "ติดตาม", "โปรไฟล์"];
    const expectedHrefs = ["/app/personal", "/app/personal/measurements", "/app/personal/appointments", "/app/personal/care", "/app/more"];

    expect(projectMobileNavigation(patient).availableWorkspaces).toEqual(["personal"]);
    for (const navigation of [patient, patientOsm, patientOwner]) {
      const tabs = primaryTabs(navigation, "personal");
      expect(tabs.map(({ id }) => id)).toEqual(expectedIds);
      expect(tabs.map(({ label }) => label)).toEqual(expectedLabels);
      expect(tabs.map(({ href }) => href)).toEqual(expectedHrefs);
    }
    // Work roles keep their role-based tabs, including the เพิ่มเติม slot.
    expect(primaryTabs(patientOwner, "work").map(({ id }) => id)).toEqual(["home", "appointments", "patients", "workforce", "more"]);
    expect(hrefs(patientOsm).filter((href) => href.startsWith("/app/patients/"))).toContain(
      "/app/patients/assigned",
    );
  });

  it.each([
    ["/app/personal", "", "home"],
    ["/app/personal/measurements", "", "health"],
    ["/app/personal/appointments/rel-1/apt-1", "", "appointments"],
    ["/app/personal/care/rel-1/programs/program-1/rounds", "", "followup"],
    ["/app/more", "workspace=personal", "more"],
    ["/app/personal/news", "", null],
  ] as const)("marks the Patient customer tab for %s", (pathname, search, expected) => {
    const tabs = primaryTabs(projectApplicationNavigation(actor([Role.PATIENT])), "personal");
    expect(resolveActiveMobileTabId(pathname, search, tabs)).toBe(expected);
  });

  it("projects OSM task tabs only from the authorized assigned-Patient destination", () => {
    const navigation = projectApplicationNavigation(actor([Role.OSM]));
    const workTabs = primaryTabs(navigation, "work");

    expect(workTabs.map(({ id }) => id)).toEqual([
      "home",
      "appointments",
      "patients",
      "screening",
      "more",
    ]);
    expect(workTabs.map(({ href }) => href)).toEqual([
      "/app",
      "/app/appointments",
      "/app/patients/assigned",
      "/app/patients/assigned?task=screening",
      "/app/more",
    ]);
  });

  it("keeps the OSM mobile label short and announces the assigned appointment count", () => {
    const navigation = projectApplicationNavigation(actor([Role.OSM]), 4);
    const patients = primaryTabs(navigation, "work").find(({ id }) => id === "patients");

    expect(patients).toMatchObject({
      label: "เพื่อน",
      accessibleLabel: "เพื่อนที่ดูแล · รอรับนัด 4 รายการ",
      badgeCount: 4,
    });
  });

  it("omits unavailable and revoked OSM task scopes", () => {
    const noScopeNavigation = projectApplicationNavigation(
      actor([Role.OSM], { includeOsmScope: false }),
    );
    const endedNavigation = projectApplicationNavigation(actor([Role.OSM], { osmStatus: MembershipStatus.ENDED }));

    expect(projectMobileNavigation(noScopeNavigation).tabsByWorkspace.work.map(({ id }) => id)).toEqual([
      "home",
      "more",
    ]);
    expect(projectMobileNavigation(endedNavigation).tabsByWorkspace.work.some(({ id }) => id === "screening" || id === "followup")).toBe(false);
    expect(hrefs(noScopeNavigation)).not.toContain("/app/patients/assigned");
  });

  it("omits Hospital patient and management destinations without a current membership scope", () => {
    const navigation = projectApplicationNavigation(
      actor([Role.HOSPITAL], { includeHospitalScope: false }),
    );

    expect(hrefs(navigation)).not.toContain("/app/patients");
    expect(projectMobileNavigation(navigation).tabsByWorkspace.work.map(({ id }) => id)).toEqual([
      "home",
      "more",
    ]);
  });

  it("uses only current Hospital/Admin navigation entries for primary destinations", () => {
    const hospitalNavigation = projectApplicationNavigation(actor([Role.HOSPITAL]));
    const adminNavigation = projectApplicationNavigation(actor([Role.ADMIN]));

    expect(primaryTabs(hospitalNavigation, "work").map(({ id }) => id)).toEqual([
      "home",
      "appointments",
      "patients",
      "workforce",
      "more",
    ]);
    expect(primaryTabs(adminNavigation, "work").map(({ id }) => id)).toEqual([
      "home",
      "admin-hospitals",
      "admin-reports",
      "admin-review",
      "more",
    ]);
    expect(hrefs(adminNavigation)).not.toContain("/app/patients");
  });

  it("does not project Hospital operations for a suspended Hospital", () => {
    const navigation = projectApplicationNavigation(
      actor([Role.HOSPITAL], { hospitalStatus: HospitalStatus.SUSPENDED }),
    );
    const workTabs = primaryTabs(navigation, "work");

    expect(workTabs.some(({ href }) => href?.startsWith("/app/hospitals/") || href === "/app/workforce")).toBe(false);
    expect(workTabs.map(({ id }) => id)).toContain("more");
  });

  it.each(multiRoleCombinations)("keeps workspace projection deterministic for roles %s", (...roles) => {
    const navigation = projectApplicationNavigation(actor(roles));
    const projection = projectMobileNavigation(navigation);
    const expectedWorkspaces = [
      ...(roles.includes(Role.PATIENT) ? ["personal" as const] : []),
      ...(roles.some((role) => role !== Role.PATIENT) ? ["work" as const] : []),
    ];

    expect(projection.availableWorkspaces).toEqual(expectedWorkspaces);
    for (const workspace of expectedWorkspaces) {
      const tabs = projection.tabsByWorkspace[workspace];
      expect(tabs.length).toBeGreaterThan(1);
      expect(tabs.length).toBeLessThanOrEqual(5);
      expect(tabs.at(-1)?.id).toBe("more");
      expect(tabs.slice(0, -1).every(({ href }) => href !== null)).toBe(true);
      expect(tabs.map(({ id }) => id)).toEqual(
        projectMobileNavigation(navigation).tabsByWorkspace[workspace].map(({ id }) => id),
      );
    }
  });

  it("keeps combined OSM and Hospital destinations reachable from More without merging workspaces", () => {
    const navigation = projectApplicationNavigation(actor([Role.PATIENT, Role.OSM, Role.HOSPITAL]));
    const projection = projectMobileNavigation(navigation);
    const workTabs = projection.tabsByWorkspace.work;
    const more = projectMoreNavigation(navigation, workTabs);
    const moreHrefs = hrefs(more);

    expect(projection.availableWorkspaces).toEqual(["personal", "work"]);
    expect(projection.tabsByWorkspace.personal.map(({ id }) => id)).toContain("appointments");
    expect(workTabs.map(({ id }) => id)).toEqual([
      "home",
      "appointments",
      "patients",
      "screening",
      "more",
    ]);
    expect(moreHrefs).toContain("/app/patients");
    expect(moreHrefs).toContain("/app/workforce");
    expect(moreHrefs).toContain("/app/hospitals/reporting");
    // The workspace switch is a separate control; the Work home is a primary tab, so More omits it.
    expect(moreHrefs).toContain("/app/personal");
    expect(moreHrefs).toContain("/app/appointments");
    expect(moreHrefs).not.toContain("/app");
    expect(moreHrefs).not.toContain("/app/patients/assigned");
    expect(moreHrefs).not.toContain("/app/patients/assigned?task=screening");
    expect(moreHrefs).toContain("/app/patients/assigned?task=followup");
  });

  it("retains every authorized navigation entry in a primary slot or More", () => {
    for (const roles of roleCombinations) {
      const navigation = projectApplicationNavigation(actor(roles));
      const projection = projectMobileNavigation(navigation);

      for (const workspace of projection.availableWorkspaces) {
        const tabs = projection.tabsByWorkspace[workspace];
        const primaryHrefs = new Set(
          tabs.flatMap(({ href }) => (href ? [href] : [])),
        );
        const moreHrefs = new Set(hrefs(projectMoreNavigation(navigation, tabs)));
        const visibleGroups = navigation.filter(
          ({ workspace: groupWorkspace }) =>
            groupWorkspace === undefined || groupWorkspace === "all" || groupWorkspace === workspace,
        );

        for (const group of visibleGroups) {
          for (const item of group.items) {
            if (!primaryHrefs.has(item.href)) {
              expect(moreHrefs, `${workspace}: ${item.href}`).toContain(item.href);
            }
          }
        }
      }
    }
  });

  it("omits all mobile navigation slots when there is no server projection", () => {
    expect(projectMobileNavigation([])).toEqual({
      availableWorkspaces: [],
      tabsByWorkspace: { personal: [], work: [] },
    });
  });
});
