import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { projectApplicationNavigation } from "@/components/app-shell/application-navigation";
import { projectApplicationWorkspace } from "@/components/app-shell/application-workspace";
import { projectMobileNavigation } from "@/components/app-shell/mobile-tab-projection";
import type { ActorHospitalWorkspace } from "@/modules/auth/services/actor-workspace-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  WORK_HOME_MAX_TILES,
  projectActiveOsmHospitalIds,
  projectOsmTaskLinks,
  projectWorkHome,
  projectWorkHomeTiles,
} from "./work-home-projection";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "44444444-4444-4444-8444-444444444444";
const parentId = "55555555-5555-4555-8555-555555555555";
const childId = "66666666-6666-4666-8666-666666666666";

function actor(overrides: Partial<ActorContext>): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function membership(hospitalId: string, membershipType: MembershipType, status: MembershipStatus = MembershipStatus.ACTIVE): ActorContext["hospitalMemberships"][number] {
  return { hospitalId, membershipType, profession: Profession.NURSE, status, hospitalStatus: HospitalStatus.ACTIVE };
}

function osm(hospitalId: string): ActorContext["osmHospitalRelationships"][number] {
  return { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE };
}

function workspace(hospitalId: string, overrides: Partial<ActorHospitalWorkspace> = {}): ActorHospitalWorkspace {
  return {
    hospitalId,
    hospitalCode: hospitalId,
    hospitalName: `โรงพยาบาล ${hospitalId.slice(0, 4)}`,
    hospitalStatus: HospitalStatus.ACTIVE,
    network: { hospitalId, name: `เครือข่าย ${hospitalId.slice(0, 4)}` },
    hasActiveDirectChildren: false,
    ...overrides,
  };
}

function project(subject: ActorContext, workspaces: readonly ActorHospitalWorkspace[], requested?: string) {
  const projection = projectApplicationWorkspace(subject, workspaces);
  const taskLinks = projectOsmTaskLinks(projectMobileNavigation(projectApplicationNavigation(subject)).tabsByWorkspace.work);
  return { projection, taskLinks, home: projectWorkHome(projection, taskLinks, projectActiveOsmHospitalIds(subject), requested) };
}

const path = (href: string): string => href.split("?")[0] ?? href;
const withHospital = (href: string, hospitalId: string): string => `${href}?hospitalId=${hospitalId}`;
const screening = "/app/patients/assigned?task=screening";
const followup = "/app/patients/assigned?task=followup";
const screeningAt = (id: string): string => `${screening}&hospitalId=${id}`;
const followupAt = (id: string): string => `${followup}&hospitalId=${id}`;
const governance = ["/app/admin/reporting", "/app/admin/hospitals", "/app/admin/hospital-onboarding"];
const ownerRequests = ["/app/patients/access-requests", "/app/patients/service-requests", "/app/patients/service-catalog"];
const ownerTiles = (id: string, areas = false) => [
  withHospital("/app/patients", id),
  withHospital("/app/patients/provision", id),
  withHospital("/app/patients/activation", id),
  withHospital("/app/workforce", id),
  withHospital("/app/hospitals/reporting", id),
  ...(areas ? ["/app/hospitals/areas"] : []),
  withHospital("/app/hospitals/knowledge", id),
  withHospital("/app/hospitals/contact", id),
];

type Case = {
  name: string;
  subject: ActorContext;
  workspaces: ActorHospitalWorkspace[];
  requested?: string;
  scope: "hospital" | "system" | "none";
  selected?: string;
  hero: string | null;
  tiles: string[];
  shared: string[];
};

const cases: Case[] = [
  {
    name: "OSM at one Hospital",
    subject: actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(hospitalA)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: "/app/patients/assigned",
    tiles: [screeningAt(hospitalA), followupAt(hospitalA), withHospital("/app/patients/provision", hospitalA)],
    shared: [],
  },
  {
    name: "OSM at several Hospitals selecting the second",
    subject: actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(hospitalA), osm(hospitalB)] }),
    workspaces: [workspace(hospitalA), workspace(hospitalB)],
    requested: hospitalB.toUpperCase(),
    scope: "hospital", selected: hospitalB,
    hero: "/app/patients/assigned",
    tiles: [screeningAt(hospitalB), followupAt(hospitalB), withHospital("/app/patients/provision", hospitalB)],
    shared: [],
  },
  {
    name: "Hospital MEMBER",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalA, MembershipType.MEMBER)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: withHospital("/app/patients", hospitalA),
    tiles: [
      withHospital("/app/patients", hospitalA),
      withHospital("/app/patients/provision", hospitalA),
      withHospital("/app/patients/activation", hospitalA),
      withHospital("/app/workforce", hospitalA),
    ],
    shared: ["/app/patients/access-requests", "/app/patients/service-requests"],
  },
  {
    name: "Hospital OWNER",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalA, MembershipType.OWNER)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: withHospital("/app/patients", hospitalA),
    tiles: ownerTiles(hospitalA),
    shared: ownerRequests,
  },
  {
    name: "OWNER of a parent network",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(parentId, MembershipType.OWNER)] }),
    workspaces: [workspace(parentId, { hasActiveDirectChildren: true })],
    scope: "hospital", selected: parentId,
    hero: withHospital("/app/patients", parentId),
    tiles: ownerTiles(parentId, true),
    shared: ownerRequests,
  },
  {
    name: "Platform ADMIN only",
    subject: actor({ roles: [Role.ADMIN] }),
    workspaces: [],
    scope: "system",
    hero: "/app/admin/reporting",
    tiles: ["/app/admin/hospitals", "/app/admin/reporting", "/app/admin/hospital-onboarding"],
    shared: [],
  },
  {
    name: "ADMIN who is also a Hospital OWNER",
    subject: actor({ roles: [Role.ADMIN, Role.HOSPITAL], hospitalMemberships: [membership(hospitalA, MembershipType.OWNER)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: withHospital("/app/patients", hospitalA),
    tiles: ownerTiles(hospitalA),
    // Request policies deny ADMIN, so only governance is shared here.
    shared: governance,
  },
  {
    name: "OSM who is also a Patient",
    subject: actor({ roles: [Role.OSM, Role.PATIENT], osmHospitalRelationships: [osm(hospitalA)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: "/app/patients/assigned",
    tiles: [screeningAt(hospitalA), followupAt(hospitalA), withHospital("/app/patients/provision", hospitalA)],
    shared: [],
  },
  {
    name: "MEMBER at one Hospital and OSM at another, selecting the MEMBER Hospital",
    subject: actor({
      roles: [Role.HOSPITAL, Role.OSM],
      hospitalMemberships: [membership(hospitalA, MembershipType.MEMBER)],
      osmHospitalRelationships: [osm(hospitalB)],
    }),
    workspaces: [workspace(hospitalA), workspace(hospitalB)],
    requested: hospitalA,
    scope: "hospital", selected: hospitalA,
    hero: withHospital("/app/patients", hospitalA),
    // OSM task tiles belong to the OSM Hospital only; they never appear under another Hospital's chip.
    tiles: [
      withHospital("/app/patients", hospitalA),
      withHospital("/app/patients/provision", hospitalA),
      withHospital("/app/patients/activation", hospitalA),
      withHospital("/app/workforce", hospitalA),
    ],
    shared: ["/app/patients/access-requests", "/app/patients/service-requests"],
  },
];

describe("work home projection per actor", () => {
  it.each(cases)("$name", ({ subject, workspaces, requested, scope, selected, hero, tiles, shared }) => {
    const { projection, taskLinks, home } = project(subject, workspaces, requested);

    expect(home.scope.kind).toBe(scope);
    if (home.scope.kind === "hospital") expect(home.scope.hospital.hospitalId).toBe(selected);
    expect(home.hero?.href ?? null).toBe(hero);
    expect(home.tiles.map(({ href }) => href)).toEqual(tiles);
    expect(home.sharedActions.map(({ href }) => href)).toEqual(shared);

    // Nothing outside the projection: tiles come only from the selected Hospital (or governance) and task links
    // narrowed to that Hospital.
    const allowed = new Set([
      ...(home.scope.kind === "hospital" ? home.scope.hospital.actions : home.scope.kind === "system" ? projection.governanceActions : []),
      ...(home.scope.kind === "hospital" ? taskLinks.map(({ href }) => ({ href: `${href}&hospitalId=${selected}` })) : taskLinks),
    ].map(({ href }) => href));
    expect(home.tiles.length).toBeLessThanOrEqual(WORK_HOME_MAX_TILES);
    for (const tile of home.tiles) expect(allowed.has(tile.href)).toBe(true);
    // Cross-hospital actions never appear in the Hospital grid.
    const sharedPaths = new Set(home.sharedActions.map(({ href }) => path(href)));
    for (const tile of home.tiles) expect(sharedPaths.has(path(tile.href))).toBe(false);
  });

  it("overflows to a final 'ทั้งหมด' tile after seven ordered actions", () => {
    const subject = actor({ roles: [Role.HOSPITAL, Role.OSM], hospitalMemberships: [membership(parentId, MembershipType.OWNER)], osmHospitalRelationships: [osm(parentId)] });
    const { home } = project(subject, [workspace(parentId, { hasActiveDirectChildren: true })]);

    expect(home.tiles).toHaveLength(WORK_HOME_MAX_TILES);
    expect(home.tiles.map(({ href }) => href)).toEqual([...ownerTiles(parentId).slice(0, 1), screeningAt(parentId), followupAt(parentId), ...ownerTiles(parentId).slice(1, 5), "/app/more"]);
    expect(home.tiles.at(-1)).toEqual({ href: "/app/more", icon: "more", label: "ทั้งหมด" });
  });

  it("keys icons by href with a neutral default and keeps unknown hrefs after ordered ones", () => {
    const tiles = projectWorkHomeTiles([
      { href: "/app/unknown", label: "อื่น ๆ" },
      { href: followup, label: "ติดตาม" },
      { href: withHospital("/app/workforce", hospitalA), label: "บุคลากร" },
    ]);
    expect(tiles.map(({ href, icon }) => [href, icon])).toEqual([
      [followup, "followup"],
      [withHospital("/app/workforce", hospitalA), "workforce"],
      ["/app/unknown", "default"],
    ]);
  });

  describe("forged hospitalId falls back to the first candidate (ADR-0013 §2)", () => {
    const subject = actor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [membership(parentId, MembershipType.MEMBER), membership(hospitalB, MembershipType.MEMBER, MembershipStatus.SUSPENDED)],
    });
    const workspaces = [
      workspace(parentId),
      workspace(childId, { network: { hospitalId: parentId, name: "เครือข่าย 5555" } }),
      workspace(hospitalB),
      workspace(hospitalA, { hospitalStatus: HospitalStatus.SUSPENDED }),
    ];

    it.each([
      ["a Hospital without any relationship", "99999999-9999-4999-8999-999999999999"],
      ["a Child reached only through the Parent", childId],
      ["an inactive direct membership", hospitalB],
      ["a suspended Hospital", hospitalA],
      ["a non-string locator", undefined],
    ])("%s", (_label, requested) => {
      const { home } = project(subject, workspaces, requested);
      expect(home.scope.kind === "hospital" && home.scope.hospital.hospitalId).toBe(parentId);
      expect(home.tiles.every(({ href }) => !href.includes(childId) && !href.includes(hospitalB) && !href.includes(hospitalA))).toBe(true);
    });

    it("lists non-selectable projected Hospitals with their status instead of actions", () => {
      const { home } = project(subject, workspaces);
      expect(home.unavailableHospitals.map(({ hospitalId }) => hospitalId)).toEqual([childId, hospitalB, hospitalA]);
      expect(home.unavailableHospitals.every(({ actions }) => actions.length === 0)).toBe(true);
    });
  });
});
