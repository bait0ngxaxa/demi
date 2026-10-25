import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { projectApplicationNavigation } from "@/components/app-shell/application-navigation";
import { projectApplicationWorkspace } from "@/components/app-shell/application-workspace";
import { NAVIGATION_SECTION_ORDER } from "@/components/app-shell/navigation-sections";
import type { ActorHospitalWorkspace } from "@/modules/auth/services/actor-workspace-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  WORK_HOME_MAX_TILES,
  projectActiveOsmHospitalIds,
  projectOsmTaskLinks,
  projectWorkHome,
  projectWorkHomeTiles,
  projectWorkNavigationOrder,
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

/** A Hospital grouped under another network is a CHILD; network PARENT tests set `networkRole` explicitly. */
function workspace(hospitalId: string, overrides: Partial<ActorHospitalWorkspace> = {}): ActorHospitalWorkspace {
  const network = overrides.network ?? { hospitalId, name: `เครือข่าย ${hospitalId.slice(0, 4)}` };
  return {
    hospitalId,
    hospitalCode: hospitalId,
    hospitalName: `โรงพยาบาล ${hospitalId.slice(0, 4)}`,
    hospitalStatus: HospitalStatus.ACTIVE,
    network,
    networkRole: network.hospitalId === hospitalId ? null : "CHILD",
    hasActiveDirectChildren: false,
    ...overrides,
  };
}

function project(subject: ActorContext, workspaces: readonly ActorHospitalWorkspace[], requested?: string) {
  const navigation = projectApplicationNavigation(subject, workspaces);
  const projection = projectApplicationWorkspace(subject, workspaces, navigation);
  const taskLinks = projectOsmTaskLinks(navigation);
  return { projection, navigation, taskLinks, home: projectWorkHome(projection, navigation, projectActiveOsmHospitalIds(subject), requested) };
}

const path = (href: string): string => href.split("?")[0] ?? href;
const withHospital = (href: string, hospitalId: string): string => `${href}${href.includes("?") ? "&" : "?"}hospitalId=${hospitalId}`;
const appointmentsAt = (hospitalId: string): string => withHospital("/app/appointments", hospitalId);
const screening = "/app/patients/assigned?task=screening";
const followup = "/app/patients/assigned?task=followup";
const screeningAt = (id: string): string => `${screening}&hospitalId=${id}`;
const followupAt = (id: string): string => `${followup}&hospitalId=${id}`;
const governance = ["/app/admin/reporting", "/app/admin/hospitals", "/app/admin/hospital-onboarding"];
const ownerRequests = ["/app/patients/service-requests"];
// Home pins core care and OWNER tools before remaining Work navigation destinations.
const ownerTiles = (id: string, areas = false) => [
  appointmentsAt(id),
  withHospital("/app/patients", id),
  withHospital("/app/hospitals/reporting", id),
  withHospital("/app/users", id),
  withHospital("/app/hospitals/knowledge", id),
  withHospital("/app/patients?task=service", id),
  withHospital("/app/appointments/new", id),
  withHospital("/app/patients/provision", id),
  ...(areas ? ["/app/hospitals/reporting?scope=network"] : []),
  withHospital("/app/hospitals/content", id),
  withHospital("/app/hospitals/contacts", id),
  withHospital("/app/hospitals/settings", id),
  ...(areas ? [withHospital("/app/hospitals/network", id)] : []),
];

const cappedOwnerTiles = (id: string, areas = false): string[] => [
  ...ownerTiles(id, areas).slice(0, WORK_HOME_MAX_TILES - 1),
  "/app/more",
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
    hero: appointmentsAt(hospitalA),
    tiles: [appointmentsAt(hospitalA), screeningAt(hospitalA), followupAt(hospitalA)],
    shared: [],
  },
  {
    name: "OSM at several Hospitals selecting the second",
    subject: actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(hospitalA), osm(hospitalB)] }),
    workspaces: [workspace(hospitalA), workspace(hospitalB)],
    requested: hospitalB.toUpperCase(),
    scope: "hospital", selected: hospitalB,
    hero: appointmentsAt(hospitalB),
    tiles: [appointmentsAt(hospitalB), screeningAt(hospitalB), followupAt(hospitalB)],
    shared: [],
  },
  {
    name: "Hospital MEMBER",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalA, MembershipType.MEMBER)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: withHospital("/app/patients", hospitalA),
    tiles: [
      appointmentsAt(hospitalA),
      withHospital("/app/patients", hospitalA),
      withHospital("/app/patients?task=service", hospitalA),
      withHospital("/app/appointments/new", hospitalA),
      "/app/hospitals/reporting/export",
      withHospital("/app/hospitals/content", hospitalA),
      withHospital("/app/hospitals/contacts", hospitalA),
    ],
    shared: [],
  },
  {
    name: "Hospital OWNER",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalA, MembershipType.OWNER)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: withHospital("/app/patients", hospitalA),
    tiles: cappedOwnerTiles(hospitalA),
    shared: ownerRequests,
  },
  {
    name: "OWNER of a parent network",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(parentId, MembershipType.OWNER)] }),
    workspaces: [workspace(parentId, { networkRole: "PARENT", hasActiveDirectChildren: true })],
    scope: "hospital", selected: parentId,
    hero: withHospital("/app/patients", parentId),
    tiles: cappedOwnerTiles(parentId, true),
    shared: ownerRequests,
  },
  {
    name: "Platform ADMIN only",
    subject: actor({ roles: [Role.ADMIN] }),
    workspaces: [],
    scope: "system",
    hero: "/app/admin/reporting",
    tiles: ["/app/admin/hospital-onboarding", "/app/admin/hospitals", "/app/admin/reporting"],
    shared: [],
  },
  {
    name: "ADMIN who is also a Hospital OWNER",
    subject: actor({ roles: [Role.ADMIN, Role.HOSPITAL], hospitalMemberships: [membership(hospitalA, MembershipType.OWNER)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: withHospital("/app/patients", hospitalA),
    tiles: cappedOwnerTiles(hospitalA),
    // Request policies deny ADMIN, so only governance is shared here.
    shared: governance,
  },
  {
    name: "OSM who is also a Patient",
    subject: actor({ roles: [Role.OSM, Role.PATIENT], osmHospitalRelationships: [osm(hospitalA)] }),
    workspaces: [workspace(hospitalA)],
    scope: "hospital", selected: hospitalA,
    hero: appointmentsAt(hospitalA),
    tiles: [appointmentsAt(hospitalA), screeningAt(hospitalA), followupAt(hospitalA)],
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
    // OSM task tiles belong to the OSM Hospital only; the selected MEMBER Hospital uses its own navigation items.
    tiles: [
      appointmentsAt(hospitalA),
      withHospital("/app/patients", hospitalA),
      withHospital("/app/patients?task=service", hospitalA),
      withHospital("/app/appointments/new", hospitalA),
      "/app/hospitals/reporting/export",
      withHospital("/app/hospitals/content", hospitalA),
      withHospital("/app/hospitals/contacts", hospitalA),
    ],
    shared: [],
  },
];

describe("work home projection per actor", () => {
  it("keeps reporting, user administration and publishing visible for OWNER within eight tiles", () => {
    const subject = actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalA, MembershipType.OWNER)] });
    const { home } = project(subject, [workspace(hospitalA)]);
    expect(home.tiles.length).toBeLessThanOrEqual(8);
    expect(home.tiles.map(({ href }) => href)).toEqual(expect.arrayContaining([
      withHospital("/app/hospitals/reporting", hospitalA),
      withHospital("/app/users", hospitalA),
      withHospital("/app/hospitals/knowledge", hospitalA),
    ]));
  });
  it("keeps MEMBER care, information and export links in the selected Hospital grid", () => {
    const subject = actor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [membership(hospitalA, MembershipType.MEMBER)],
    });
    const { home, projection } = project(subject, [workspace(hospitalA)]);
    const exportAction = projection.hospitals[0]?.actions.find(({ href }) => href === "/app/hospitals/reporting/export");

    expect(home.tiles.map(({ href }) => href)).toEqual([
      appointmentsAt(hospitalA),
      withHospital("/app/patients", hospitalA),
      withHospital("/app/patients?task=service", hospitalA),
      withHospital("/app/appointments/new", hospitalA),
      "/app/hospitals/reporting/export",
      withHospital("/app/hospitals/content", hospitalA),
      withHospital("/app/hospitals/contacts", hospitalA),
    ]);
    expect(home.sharedActions).toEqual([]);
    expect(exportAction?.category).toBe("patient");
  });

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
      // The overflow tile is part of the projection whenever actions exceed the grid.
      { href: "/app/more" },
    ].map(({ href }) => href));
    expect(home.tiles.length).toBeLessThanOrEqual(WORK_HOME_MAX_TILES);
    for (const tile of home.tiles) expect(allowed.has(tile.href)).toBe(true);
    // Cross-hospital actions never appear in the Hospital grid.
    const sharedPaths = new Set(home.sharedActions.map(({ href }) => path(href)));
    for (const tile of home.tiles) expect(sharedPaths.has(path(tile.href))).toBe(false);
  });

  it("overflows to a final 'ทั้งหมด' tile when selected-Hospital actions exceed the grid", () => {
    const subject = actor({ roles: [Role.HOSPITAL, Role.OSM], hospitalMemberships: [membership(parentId, MembershipType.OWNER)], osmHospitalRelationships: [osm(parentId)] });
    const { home } = project(subject, [workspace(parentId, { networkRole: "PARENT", hasActiveDirectChildren: true })]);

    expect(home.tiles).toHaveLength(WORK_HOME_MAX_TILES);
    expect(home.tiles.map(({ href }) => href)).toEqual(cappedOwnerTiles(parentId, true));
    expect(home.tiles.at(-1)).toEqual({ href: "/app/more", icon: "more", label: "ทั้งหมด" });
  });

  it("keeps remaining items in navigation order after the seven priority destinations", () => {
    const subject = actor({ roles: [Role.HOSPITAL, Role.OSM], hospitalMemberships: [membership(parentId, MembershipType.OWNER)], osmHospitalRelationships: [osm(parentId)] });
    const { navigation } = project(subject, [workspace(parentId, { networkRole: "PARENT", hasActiveDirectChildren: true })]);
    const sectionOf = (href: string): number => {
      const key = href.split("&")[0]?.replace(/\?hospitalId=.*$/u, "") ?? href;
      const group = navigation.find(({ workspace: groupWorkspace, items }) => groupWorkspace === "work" && items.some((item) => item.href === key));
      return group ? NAVIGATION_SECTION_ORDER.indexOf(group.id) : Number.POSITIVE_INFINITY;
    };
    const ranks = projectWorkNavigationOrder(navigation).slice(7).map((href) => sectionOf(href));

    expect(ranks.every(Number.isFinite)).toBe(true);
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
  });

  it("keys icons by href with a neutral default and keeps unknown hrefs after ordered ones", () => {
    const tiles = projectWorkHomeTiles([
      { href: "/app/unknown", label: "อื่น ๆ" },
      { href: followup, label: "ติดตาม" },
      { href: withHospital("/app/workforce", hospitalA), label: "บุคลากร" },
    ], ["/app/patients/assigned?task=followup", "/app/workforce"]);
    expect(tiles.map(({ href, icon }) => [href, icon])).toEqual([
      [followup, "followup"],
      [withHospital("/app/workforce", hospitalA), "workforce"],
      ["/app/unknown", "default"],
    ]);
  });

  it("uses existing care and task glyphs for direct Hospital tasks", () => {
    const taskHrefs = [
      withHospital("/app/patients?task=service", hospitalA),
    ];
    const tiles = projectWorkHomeTiles(
      taskHrefs.map((href) => ({ href, label: "งานดูแล" })),
      taskHrefs.map((href) => href.split("&")[0] ?? href),
    );

    expect(tiles.map(({ href, icon }) => [href, icon])).toEqual([
      [taskHrefs[0], "care"],
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
