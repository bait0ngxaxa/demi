import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorHospitalWorkspace } from "@/modules/auth/services/actor-workspace-service";
import type { ActorContext, ActorHospitalMembership } from "@/modules/auth/types/actor-context";
import {
  decidePatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";

import { canOpenParentAreaOverview, projectApplicationNavigation } from "./application-navigation";
import { NAVIGATION_SECTION_ORDER } from "./navigation-sections";
import { isNavigationItemActive, resolveActiveNavigationHrefs } from "./navigation-state";
import type { ApplicationNavigationGroup, ApplicationWorkspaceContext } from "./navigation-types";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const parentId = "55555555-5555-4555-8555-555555555555";
const runtimeEnvironments = [
  ["local development", { NODE_ENV: "development" }],
  ["Vercel Preview", { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_PROJECT_ID: "preview-project" }],
  ["Vercel Production", { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: "production-project" }],
  ["VPS production", { NODE_ENV: "production" }],
  ["Docker production", { NODE_ENV: "production", CONTAINER_RUNTIME: "docker" }],
  ["non-Vercel production", { NODE_ENV: "production", VERCEL: "0" }],
] as const;

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

function membership(
  id: string,
  membershipType: MembershipType,
  overrides: Partial<ActorHospitalMembership> = {},
): ActorHospitalMembership {
  return { hospitalId: id, membershipType, profession: Profession.NURSE, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE, ...overrides };
}

function osm(id: string): ActorContext["osmHospitalRelationships"][number] {
  return { hospitalId: id, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE };
}

/** A Hospital workspace; `parent: null` makes it a network PARENT (its own network). */
function workspace(id: string, parent: string | null, overrides: Partial<ActorHospitalWorkspace> = {}): ActorHospitalWorkspace {
  return {
    hospitalId: id,
    hospitalCode: id,
    hospitalName: `โรงพยาบาล ${id.slice(0, 4)}`,
    hospitalStatus: HospitalStatus.ACTIVE,
    network: { hospitalId: parent ?? id, name: "เครือข่าย" },
    networkRole: parent ? "CHILD" : "PARENT",
    hasActiveDirectChildren: false,
    ...overrides,
  };
}

function project(
  subject: ActorContext,
  workspaces: readonly ActorHospitalWorkspace[] = [],
  awaitingOsmAcceptanceCount = 0,
): readonly ApplicationNavigationGroup[] {
  return projectApplicationNavigation(subject, workspaces, awaitingOsmAcceptanceCount);
}

function allHrefs(groups: readonly ApplicationNavigationGroup[]): string[] {
  return groups.flatMap(({ items }) => items.map(({ href }) => href));
}

function navigationLabels(subject: ActorContext, workspaces: readonly ActorHospitalWorkspace[] = []): string[] {
  return project(subject, workspaces).flatMap((group) => [
    ...(group.label ? [group.label] : []),
    ...group.items.map((item) => item.label),
  ]);
}

/** Sections as one workspace renders them: [id, heading, item hrefs]. */
function sectionsIn(groups: readonly ApplicationNavigationGroup[], context: ApplicationWorkspaceContext) {
  return groups
    .filter(({ workspace: groupWorkspace }) => groupWorkspace === undefined || groupWorkspace === "all" || groupWorkspace === context)
    .map(({ id, label, items }) => [id, label, items.map(({ href }) => href)] as const);
}

function simulateRuntimeEnvironment(environment: Readonly<Record<string, string>>): void {
  for (const key of ["NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_PROJECT_ID", "CONTAINER_RUNTIME"]) {
    vi.stubEnv(key, environment[key] ?? "");
  }
}

// UI-01: the Patient's customer bottom and top menus first; remaining Personal items stay as secondary sections.
const personalSections = [
  ["primary", null, ["/app/personal", "/app/personal/health", "/app/personal/appointments", "/app/personal/care", "/app/more"]],
  ["top-menu", "เมนูด่วน", ["/app/personal/appointments?tab=history", "/app/family", "/app/personal/medications", "/app/personal/wellness", "/app/personal#personal-hospital-contact"]],
  ["care", "การดูแลของฉัน", ["/app/personal/services"]],
  ["health-records", "บันทึกสุขภาพ", ["/app/personal/measurements"]],
  ["reports-info", "ข่าวสารและความรู้", ["/app/personal/news", "/app/personal/knowledge"]],
] as const;
const patientAccount = ["account", "บัญชีและช่วยเหลือ", ["/app/personal/profile", "/app/settings", "/app/support"]] as const;
const workAccount = ["account", "บัญชีและช่วยเหลือ", ["/app/family", "/app/settings", "/app/support"]] as const;
// WB-DF-14 (Product Owner 2026-10-26): an account holding ADMIN receives reports, so it has no submit entry.
const adminWorkAccount = ["account", "บัญชีและช่วยเหลือ", ["/app/family", "/app/settings"]] as const;
const osmCare = ["care", "ดูแลผู้ป่วย", ["/app/appointments", "/app/patients/assigned", "/app/patients/assigned?task=screening", "/app/patients/assigned?task=followup"]] as const;
const osmReports = ["reports-info", "รายงานและข้อมูล", ["/app/hospitals/content", "/app/hospitals/contacts"]] as const;
const staffRegistration = ["registration", "นำเข้าผู้ป่วย", ["/app/patients/provision"]] as const;
const ownerAdministration = ["/app/users", "/app/hospitals/settings", "/app/hospitals/knowledge"];
const ownerSections = (areas: boolean) => [
  ["home", null, ["/app"]],
  ["care", "ดูแลผู้ป่วย", ["/app/appointments", "/app/patients", "/app/patients/assign-osm", "/app/services", "/app/appointments/new"]],
  staffRegistration,
  // WB-DF-14 (Product Owner 2026-10-26): the OWNER support inbox is removed; reports go to the platform ADMIN.
  ["review-queue", "คำขอรอตรวจ", ["/app/patients/service-requests"]],
  ["reports-info", "รายงานและข้อมูล", ["/app/hospitals/reporting", "/app/hospitals/content", "/app/hospitals/contacts"]],
  ["administration", "บริหารโรงพยาบาล", [...ownerAdministration, ...(areas ? ["/app/hospitals/network"] : [])]],
  workAccount,
] as const;
const memberSections = () => [
  ["home", null, ["/app"]],
  ["care", "ดูแลผู้ป่วย", ["/app/appointments", "/app/patients", "/app/services", "/app/appointments/new"]],
  // Product Owner decision 2026-10-21: every ACTIVE MEMBER has the export-only entry.
  ["reports-info", "รายงานและข้อมูล", ["/app/hospitals/reporting/export", "/app/hospitals/content", "/app/hospitals/contacts"]],
  workAccount,
] as const;

/** Every href each actor saw before UI-4 (frozen from the previous projection); the new recovery item is additive. */
const previousHrefs: Record<string, readonly string[]> = {
  patient: ["/app/personal", "/app/personal/care", "/app/personal/services", "/app/personal/medications", "/app/personal/wellness", "/app/personal/measurements", "/app/personal/news", "/app/personal/knowledge", "/app/personal/appointments", "/app/personal/profile", "/app/personal/password", "/app/family", "/app/settings", "/app/support"],
  osm: ["/app", "/app/hospitals/contacts", "/app/hospitals/content", "/app/patients/assigned", "/app/family", "/app/settings", "/app/support"],
  member: ["/app", "/app/hospitals/contacts", "/app/hospitals/content", "/app/patients", "/app/family", "/app/settings", "/app/support"],
  memberExport: ["/app", "/app/hospitals/contacts", "/app/hospitals/content", "/app/patients", "/app/family", "/app/settings", "/app/support"],
  owner: ["/app", "/app/workforce", "/app/hospitals/contact", "/app/hospitals/contacts", "/app/hospitals/knowledge", "/app/hospitals/content", "/app/hospitals/support", "/app/hospitals/reporting", "/app/patients", "/app/patients/provision", "/app/patients/activation", "/app/patients/service-requests", "/app/patients/service-catalog", "/app/family", "/app/settings", "/app/support"],
  admin: ["/app", "/app/admin/reporting", "/app/admin/hospitals", "/app/admin/hospital-onboarding", "/app/family"],
  adminOwner: ["/app", "/app/workforce", "/app/hospitals/contact", "/app/hospitals/contacts", "/app/hospitals/knowledge", "/app/hospitals/content", "/app/hospitals/support", "/app/hospitals/reporting", "/app/patients", "/app/patients/provision", "/app/patients/activation", "/app/admin/reporting", "/app/admin/hospitals", "/app/admin/hospital-onboarding", "/app/family", "/app/settings", "/app/support"],
  osmPatient: ["/app/personal", "/app", "/app/personal/care", "/app/personal/services", "/app/personal/medications", "/app/personal/wellness", "/app/personal/measurements", "/app/personal/news", "/app/personal/knowledge", "/app/personal/appointments", "/app/personal/profile", "/app/personal/password", "/app/hospitals/contacts", "/app/hospitals/content", "/app/patients/assigned", "/app/family", "/app/settings", "/app/support"],
};

type Case = {
  name: keyof typeof previousHrefs | "parentOwner";
  subject: ActorContext;
  workspaces: readonly ActorHospitalWorkspace[];
  expected: Partial<Record<ApplicationWorkspaceContext, readonly (readonly [string, string | null, readonly string[]])[]>>;
};

const cases: Case[] = [
  {
    name: "patient",
    subject: actor(),
    workspaces: [],
    expected: { personal: [...personalSections, patientAccount], work: [] },
  },
  {
    name: "osm",
    subject: actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(hospitalId)] }),
    workspaces: [workspace(hospitalId, parentId)],
    expected: { work: [["home", null, ["/app"]], osmCare, osmReports, workAccount] },
  },
  {
    name: "member",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER)] }),
    workspaces: [workspace(hospitalId, parentId)],
    expected: { work: memberSections() },
  },
  {
    name: "memberExport",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER, { reportExportGranted: true })] }),
    workspaces: [workspace(hospitalId, parentId)],
    expected: { work: memberSections() },
  },
  {
    name: "owner",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)] }),
    workspaces: [workspace(hospitalId, parentId)],
    expected: { work: ownerSections(false) },
  },
  {
    name: "parentOwner",
    subject: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(parentId, MembershipType.OWNER)] }),
    workspaces: [workspace(parentId, null, { hasActiveDirectChildren: true })],
    expected: { work: ownerSections(true) },
  },
  {
    name: "admin",
    subject: actor({ roles: [Role.ADMIN] }),
    workspaces: [],
    expected: { work: [
      ["home", null, ["/app"]],
      // WB-DF-14 (Product Owner 2026-10-26): the platform ADMIN receives usage-problem reports.
      ["review-queue", "คำขอรอตรวจ", ["/app/admin/hospital-onboarding", "/app/admin/support"]],
      ["administration", "กำกับดูแล", ["/app/admin/hospitals", "/app/admin/reporting", "/app/admin/recovery"]],
      ["account", "บัญชีและช่วยเหลือ", ["/app/family"]],
    ] },
  },
  {
    name: "adminOwner",
    subject: actor({ roles: [Role.ADMIN, Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)] }),
    workspaces: [workspace(hospitalId, parentId)],
    // Request and service-catalog policies deny ADMIN, exactly as before UI-4.
    expected: { work: [
      ["home", null, ["/app"]],
      ["care", "ดูแลผู้ป่วย", ["/app/appointments", "/app/patients", "/app/patients/assign-osm", "/app/services", "/app/appointments/new"]],
      staffRegistration,
      // WB-DF-14 (Product Owner 2026-10-26): ADMIN inbox only; no OWNER inbox and no submit entry for ADMIN.
      ["review-queue", "คำขอรอตรวจ", ["/app/admin/hospital-onboarding", "/app/admin/support"]],
      ["reports-info", "รายงานและข้อมูล", ["/app/hospitals/reporting", "/app/hospitals/content", "/app/hospitals/contacts"]],
      ["administration", "บริหารโรงพยาบาลและกำกับดูแล", ["/app/users", "/app/hospitals/settings", "/app/hospitals/knowledge", "/app/admin/hospitals", "/app/admin/reporting", "/app/admin/recovery"]],
      adminWorkAccount,
    ] },
  },
  {
    name: "osmPatient",
    subject: actor({ roles: [Role.OSM, Role.PATIENT], osmHospitalRelationships: [osm(hospitalId)] }),
    workspaces: [workspace(hospitalId, parentId)],
    expected: {
      personal: [...personalSections, patientAccount],
      work: [["home", null, ["/app"]], osmCare, osmReports, workAccount],
    },
  },
];

describe("UI-4 task-based navigation per actor", () => {
  it("projects the OSM label and server-computed appointment acceptance count", () => {
    const groups = project(
      actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(hospitalId)] }),
      [workspace(hospitalId, parentId)],
      3,
    );
    const assignedPatients = groups.flatMap(({ items }) => items).find(({ href }) => href === "/app/patients/assigned");

    expect(assignedPatients).toMatchObject({ label: "ผู้ป่วยที่ดูแล", badgeCount: 3 });
  });

  it("does not link the retired patient account-access routes from navigation", () => {
    const owner = actor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)],
    });

    const hrefs = allHrefs(project(owner));

    expect(hrefs).not.toContain("/patient/access-request");
    expect(hrefs).not.toContain("/app/patients/access-requests");
  });

  it("gives an active Hospital MEMBER the direct care tasks without OWNER administration", () => {
    const member = actor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER)],
    });
    const memberHrefs = allHrefs(project(member));

    expect(memberHrefs).toEqual(expect.arrayContaining([
      "/app/services",
      "/app/appointments/new",
    ]));
    expect(memberHrefs).not.toContain("/app/patients?task=screening");
    expect(memberHrefs).not.toContain("/app/patients?task=followup");
    for (const href of ownerAdministration) expect(memberHrefs).not.toContain(href);
    expect(memberHrefs).not.toEqual(expect.arrayContaining(ownerAdministration));
    expect(memberHrefs).not.toEqual(expect.arrayContaining([
      "/app/patients/provision",
      "/app/patients/activation",
      "/app/patients/service-requests",
      "/app/patients/assign-osm",
      "/app/hospitals/knowledge",
      "/app/hospitals/contact",
      "/app/hospitals/support",
    ]));
  });

  it.each([
    { status: MembershipStatus.SUSPENDED, hospitalStatus: HospitalStatus.ACTIVE },
    { status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.SUSPENDED },
  ])("withholds Hospital care tasks when membership or Hospital is inactive (%j)", ({ status, hospitalStatus }) => {
    const subject = actor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER, { status, hospitalStatus })],
    });
    const projected = allHrefs(project(subject));

    expect(projected).not.toContain("/app/services");
    expect(projected).not.toContain("/app/patients?task=screening");
    expect(projected).not.toContain("/app/patients?task=followup");
    expect(projected).not.toContain("/app/appointments/new");
  });

  it.each([MembershipType.OWNER, MembershipType.MEMBER])("keeps direct Hospital %s care in one section within six items", (membershipType) => {
    const groups = project(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, membershipType)] }));
    const care = groups.filter(({ id }) => id === "care");
    expect(care).toHaveLength(1);
    expect(care[0]?.items.length).toBeLessThanOrEqual(6);
  });

  it("keeps all existing OSM care entries alongside OWNER tasks for a mixed account", () => {
    const groups = project(actor({
      roles: [Role.HOSPITAL, Role.OSM],
      hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)],
      osmHospitalRelationships: [osm(hospitalId)],
    }));
    expect(groups.find(({ id }) => id === "care")?.items.map(({ href }) => href)).toEqual([
      "/app/appointments",
      "/app/patients/assigned",
      "/app/patients/assigned?task=screening",
      "/app/patients/assigned?task=followup",
      "/app/patients",
      "/app/patients/assign-osm",
      "/app/services",
      "/app/appointments/new",
    ]);
  });

  it.each(cases)("$name: exact section ids, headings, order and item hrefs", ({ subject, workspaces, expected }) => {
    const groups = project(subject, workspaces);

    for (const context of ["personal", "work"] as const) {
      expect(sectionsIn(groups, context)).toEqual(
        expected[context] ?? (groups.some(({ workspace: groupWorkspace }) => groupWorkspace === context) ? "missing expectation" : sectionsIn(groups, context)),
      );
    }
    // Sections follow NAVIGATION_SECTION_ORDER within each workspace and are never empty.
    for (const context of ["personal", "work"] as const) {
      const ids = sectionsIn(groups, context).map(([id]) => NAVIGATION_SECTION_ORDER.indexOf(id));
      expect(ids).toEqual([...ids].sort((left, right) => left - right));
    }
    expect(groups.every(({ items }) => items.length > 0)).toBe(true);
  });

  it.each(cases.filter(({ name }) => name in previousHrefs))("$name: loses no destination that was visible before UI-4", ({ name, subject, workspaces }) => {
    const reachable = new Set(allHrefs(project(subject, workspaces)));
    const lost = (previousHrefs[name] ?? []).filter((href) => !reachable.has(href));

    // Password stays on Personal Settings; administration entry points are consolidated into their primary directories.
    // WB-DF-14 (Product Owner 2026-10-26) removes the OWNER support inbox and the ADMIN submit entry on purpose.
    expect(lost).toEqual(subject.roles.includes(Role.PATIENT) ? ["/app/personal/password"] : name === "owner"
      ? ["/app/workforce", "/app/hospitals/contact", "/app/hospitals/support", "/app/patients/activation", "/app/patients/service-catalog"]
      : name === "adminOwner"
        ? ["/app/workforce", "/app/hospitals/contact", "/app/hospitals/support", "/app/patients/activation", "/app/support"]
        : []);
  });

  it("keeps sections at six items or fewer for every projected actor", () => {
    for (const { subject, workspaces } of cases) {
      for (const group of project(subject, workspaces)) {
        expect(group.items.length, `${group.id}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it("does not project the workspace switch as a navigation section", () => {
    const groups = project(actor({ roles: [Role.HOSPITAL, Role.PATIENT], hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER)] }));
    expect(groups.map(({ label }) => label)).not.toContain("พื้นที่ใช้งาน");
    // UI-01: the Personal home is the first customer bottom-menu entry; the Work home keeps its own section.
    expect(groups.filter(({ id }) => id === "home" || id === "primary").map(({ workspace: groupWorkspace, items }) => [groupWorkspace, items[0]?.href])).toEqual([
      ["personal", "/app/personal"],
      ["work", "/app"],
    ]);
  });
});

describe("orphan entries reuse their pages' policies", () => {
  const memberships: ActorHospitalMembership[][] = [
    [membership(hospitalId, MembershipType.OWNER)],
    [membership(hospitalId, MembershipType.MEMBER)],
    [membership(hospitalId, MembershipType.OWNER, { status: MembershipStatus.SUSPENDED })],
    [membership(hospitalId, MembershipType.OWNER, { hospitalStatus: HospitalStatus.SUSPENDED })],
    [membership(hospitalId, MembershipType.OWNER, { status: MembershipStatus.INVITED })],
    [],
  ];

  it.each(memberships.flatMap((hospitalMemberships) => [
    { roles: [Role.HOSPITAL], hospitalMemberships },
    { roles: [Role.OSM, Role.PATIENT], hospitalMemberships },
    { roles: [Role.ADMIN, Role.HOSPITAL], hospitalMemberships },
  ]))("assign-osm follows decidePatientOsmAssignmentPolicy (%j)", ({ roles, hospitalMemberships }) => {
    const subject = actor({ roles, hospitalMemberships });
    const pageAllows = subject.hospitalMemberships.some(({ hospitalId: target }) =>
      decidePatientOsmAssignmentPolicy({ actor: subject, capability: PATIENT_ASSIGN_OSM_CAPABILITY, targetHospitalId: target }).allowed,
    );

    expect(allHrefs(project(subject)).includes("/app/patients/assign-osm")).toBe(pageAllows);
  });

  it.each([
    ["OWNER of a MAIN Hospital with Children", [membership(parentId, MembershipType.OWNER)], [workspace(parentId, null, { hasActiveDirectChildren: true })], true],
    ["OWNER of a MAIN Hospital without Children (the page shows its empty state)", [membership(parentId, MembershipType.OWNER)], [workspace(parentId, null)], true],
    ["OWNER of a Child Hospital", [membership(hospitalId, MembershipType.OWNER)], [workspace(hospitalId, parentId)], false],
    ["MEMBER of a MAIN Hospital", [membership(parentId, MembershipType.MEMBER)], [workspace(parentId, null)], false],
    ["suspended OWNER membership", [membership(parentId, MembershipType.OWNER, { status: MembershipStatus.SUSPENDED })], [workspace(parentId, null)], false],
    ["OWNER of a suspended MAIN Hospital", [membership(parentId, MembershipType.OWNER, { hospitalStatus: HospitalStatus.SUSPENDED })], [workspace(parentId, null, { hospitalStatus: HospitalStatus.SUSPENDED })], false],
    ["OWNER without workspace data", [membership(parentId, MembershipType.OWNER)], [], false],
    ["workspace without a matching membership", [], [workspace(parentId, null)], false],
  ] as const)("areas: %s", (_label, hospitalMemberships, workspaces, allowed) => {
    const subject = actor({ roles: [Role.HOSPITAL], hospitalMemberships: [...hospitalMemberships] });

    expect(canOpenParentAreaOverview(subject, workspaces)).toBe(allowed);
    expect(allHrefs(project(subject, workspaces)).includes("/app/hospitals/areas")).toBe(false);
  });

  it("never shows areas to OSM or ADMIN without a direct OWNER membership", () => {
    const workspaces = [workspace(parentId, null, { hasActiveDirectChildren: true })];
    expect(allHrefs(project(actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(parentId)] }), workspaces))).not.toContain("/app/hospitals/areas");
    expect(allHrefs(project(actor({ roles: [Role.ADMIN] }), workspaces))).not.toContain("/app/hospitals/areas");
  });
});

describe("no code keys navigation by Thai group labels", () => {
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
      return /\.(ts|tsx)$/u.test(entry.name) && !/\.test\.(ts|tsx)$/u.test(entry.name) ? [path] : [];
    });
  }

  it("compares section ids, never a label against a string literal", () => {
    const offenders = [...sourceFiles("src"), ...sourceFiles("app")].filter((path) =>
      /\blabel\s*[!=]==?\s*["'`]|["'`]\s*[!=]==?\s*[\w.?]*\blabel\b/u.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});

describe("application navigation visibility (unchanged policies)", () => {
  it("shows Platform Admin navigation only to ADMIN", () => {
    const adminLabels = navigationLabels(actor({ roles: [Role.ADMIN] }));
    const hospitalLabels = navigationLabels(actor({ roles: [Role.HOSPITAL] }));

    expect(adminLabels).toContain("กำกับดูแล");
    expect(adminLabels).toContain("โรงพยาบาลทั้งหมด");
    expect(adminLabels).toContain("คำขอขึ้นทะเบียน รพ.");
    expect(adminLabels).toContain("คืนบัญชีผู้ใช้");
    expect(hospitalLabels).not.toContain("กำกับดูแล");
    expect(hospitalLabels).not.toContain("โรงพยาบาลทั้งหมด");
    expect(hospitalLabels).not.toContain("คืนบัญชีผู้ใช้");
  });

  it.each(runtimeEnvironments)("shows Global Reporting to Platform ADMIN on %s", (_name, environment) => {
    simulateRuntimeEnvironment(environment);
    try {
      expect(navigationLabels(actor({ roles: [Role.ADMIN] }))).toContain("รายงานระบบ");
      expect(navigationLabels(actor({ roles: [Role.ADMIN], userId: "99999999-9999-4999-8999-999999999999" }))).toContain("รายงานระบบ");
      expect(navigationLabels(actor({ roles: [Role.HOSPITAL] }))).not.toContain("รายงานระบบ");
      expect(navigationLabels(actor({ roles: [Role.ADMIN, Role.HOSPITAL] }))).toContain("รายงานระบบ");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("names Owner contact management and read-only contacts unambiguously", () => {
    const owner = actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER, { profession: Profession.DOCTOR })] });
    const member = actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER)] });

    expect(navigationLabels(owner)).toContain("ตั้งค่าโรงพยาบาล");
    expect(navigationLabels(owner)).toContain("ติดต่อโรงพยาบาล");
    expect(navigationLabels(owner)).toContain("เผยแพร่ข่าวสาร");
    expect(navigationLabels(owner)).toContain("ข่าวสารและความรู้");
    expect(navigationLabels(member)).not.toContain("ตั้งค่าโรงพยาบาล");
    expect(navigationLabels(member)).toContain("ติดต่อโรงพยาบาล");
    expect(navigationLabels(member)).not.toContain("เผยแพร่ข่าวสาร");
    for (const label of ["ตั้งค่าโรงพยาบาล", "ติดต่อโรงพยาบาล", "เผยแพร่ข่าวสาร"]) {
      expect(navigationLabels(actor({ roles: [Role.ADMIN] }))).not.toContain(label);
    }
    expect(navigationLabels(actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(hospitalId)] }))).toContain("ติดต่อโรงพยาบาล");
    expect(navigationLabels(actor({ roles: [Role.OSM] }))).not.toContain("ติดต่อโรงพยาบาล");
    expect(navigationLabels(actor())).not.toContain("ติดต่อโรงพยาบาล");
  });

  it.each([MembershipStatus.SUSPENDED, MembershipStatus.ENDED, MembershipStatus.PROVISIONED, MembershipStatus.INVITED])(
    "hides work-context Hospital contacts and team content for a %s membership",
    (status) => {
      const hrefs = allHrefs(project(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER, { status })] })));

      expect(hrefs).not.toContain("/app/hospitals/contacts");
      expect(hrefs).not.toContain("/app/hospitals/content");
    },
  );

  it.each(runtimeEnvironments)("shows Hospital reporting to a direct active Hospital Owner on %s", (_name, environment) => {
    simulateRuntimeEnvironment(environment);
    try {
      expect(navigationLabels(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)] }))).toContain("รายงานโรงพยาบาล");
      expect(navigationLabels(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER)] }))).not.toContain("รายงานโรงพยาบาล");
      expect(navigationLabels(actor({ roles: [Role.ADMIN] }))).not.toContain("รายงานโรงพยาบาล");
      expect(navigationLabels(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER, { status: MembershipStatus.SUSPENDED })] }))).not.toContain("รายงานโรงพยาบาล");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("offers the shared Family route in every workspace to every active actor type, including non-Patient caregivers", () => {
    for (const roles of [[Role.HOSPITAL], [Role.OSM], [Role.PATIENT], [Role.ADMIN], [Role.PATIENT, Role.OSM], [Role.CAREGIVER, Role.PATIENT]] as const) {
      const groups = project(actor({ roles }));
      const workspaces = [...new Set(groups.flatMap(({ workspace: groupWorkspace }) => groupWorkspace === "personal" || groupWorkspace === "work" ? [groupWorkspace] : []))];

      expect(workspaces.length).toBeGreaterThan(0);
      for (const context of workspaces) {
        const sections = sectionsIn(groups, context);
        expect(sections.at(-1)?.[0]).toBe("account");
        // UI-01: the Patient reaches Family as ครอบครัวของฉัน in the top menu; Work keeps it in the account section.
        const familySection = context === "personal" ? sections.find(([id]) => id === "top-menu") : sections.at(-1);
        expect(familySection?.[2]).toContain("/app/family");
      }
    }
  });

  it("limits a CAREGIVER-only account to family, settings and problem reporting navigation", () => {
    const groups = project(actor({ roles: [Role.CAREGIVER] }));
    const hrefs = allHrefs(groups);

    // WB-DF-14 (Product Owner 2026-10-26): every non-ADMIN account may report, CAREGIVER-only included.
    expect(hrefs).toEqual(["/app/family", "/app/settings", "/app/support"]);
    expect(groups.some(({ workspace }) => workspace === "personal" || workspace === "work")).toBe(false);
    expect(hrefs.some((href) => href.startsWith("/app/personal") || href.startsWith("/app/patients") ||
      href.startsWith("/app/hospitals") || href.startsWith("/app/admin"))).toBe(false);
  });

  it("gives the Patient the customer menus verbatim in every Personal workspace and never in Work", () => {
    const bottom = ["หน้าหลัก", "ข้อมูลสุขภาพ", "นัดหมาย", "ติดตาม", "โปรไฟล์"];
    const top = ["ประวัติการนัดหมาย", "ครอบครัวของฉัน", "ยา", "Food & Finess", "ติดต่อเรา"];
    for (const roles of [[Role.PATIENT], [Role.PATIENT, Role.OSM], [Role.PATIENT, Role.HOSPITAL], [Role.PATIENT, Role.ADMIN], [Role.PATIENT, Role.CAREGIVER]] as const) {
      const groups = project(actor({ roles, osmHospitalRelationships: [osm(hospitalId)], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)] }));
      const labels = (id: string, context: ApplicationWorkspaceContext) =>
        groups.filter((group) => group.id === id && group.workspace === context).flatMap(({ items }) => items.map(({ label }) => label));

      expect(labels("primary", "personal")).toEqual(bottom);
      expect(labels("top-menu", "personal")).toEqual(top);
      expect(labels("primary", "work")).toEqual([]);
      expect(labels("top-menu", "work")).toEqual([]);
    }
    for (const roles of [[Role.HOSPITAL], [Role.OSM], [Role.ADMIN]] as const) {
      expect(project(actor({ roles })).some(({ id }) => id === "primary" || id === "top-menu")).toBe(false);
    }
  });

  it("removes the password item from navigation for every actor", () => {
    for (const roles of [[Role.PATIENT], [Role.OSM], [Role.PATIENT, Role.HOSPITAL]] as const) {
      expect(allHrefs(project(actor({ roles })))).not.toContain("/app/personal/password");
    }
  });

  it("keeps provisioning in registration and removes the standalone activation entry", () => {
    const registration = project(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)] }))
      .find(({ id }) => id === "registration");

    expect(registration?.items.map(({ href, label }) => [href, label])).toEqual([
      ["/app/patients/provision", "นำเข้าผู้ป่วย"],
    ]);
    expect(allHrefs(project(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)] })))).not.toContain("/app/patients/activation");
    expect(allHrefs(project(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.OWNER)] })))).toContain("/app/users");
  });

  it("does not grant Hospital-only activation or directory navigation to an OSM provisioning actor", () => {
    const groups = project(actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(hospitalId)] }));

    expect(groups.find(({ id }) => id === "care")?.items.find(({ href }) => href === "/app/patients/provision")?.label).toBeUndefined();
    expect(groups.some(({ id }) => id === "registration")).toBe(false);
    expect(allHrefs(groups)).not.toContain("/app/patients");
    expect(allHrefs(groups)).not.toContain("/app/patients/activation");
  });

  it("does not show assigned Patient navigation without an active OSM Hospital relationship", () => {
    const hrefs = allHrefs(project(actor({ roles: [Role.OSM], osmHospitalRelationships: [{ ...osm(hospitalId), status: MembershipStatus.SUSPENDED }] })));

    expect(hrefs.filter((href) => href.startsWith("/app/patients/assigned"))).toEqual([]);
  });

  it("does not show Patient Directory navigation to Platform ADMIN", () => {
    expect(allHrefs(project(actor({ roles: [Role.ADMIN] })))).not.toContain("/app/patients");
  });

  it.each([[Role.OSM], [Role.HOSPITAL], [Role.HOSPITAL, Role.OSM]] as const)("does not project Personal navigation from %j alone", (...roles) => {
    const groups = project(actor({ roles, hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER)] }));

    expect(groups.some(({ workspace: groupWorkspace }) => groupWorkspace === "personal")).toBe(false);
    expect(allHrefs(groups).filter((href) => href.startsWith("/app/personal"))).toEqual([]);
  });
});

describe("application navigation active state", () => {
  it("matches the dashboard exactly and nested feature routes by prefix", () => {
    expect(isNavigationItemActive("/app/workforce", { href: "/app", label: "หน้าหลัก", match: "exact" })).toBe(false);
    expect(isNavigationItemActive("/app/admin/hospital-onboarding/request-id", { href: "/app/admin/hospital-onboarding", label: "คำขอขึ้นทะเบียน รพ.", match: "prefix" })).toBe(true);
    expect(isNavigationItemActive("/app/hospitals/knowledge/record-id", { href: "/app/hospitals/knowledge", label: "เผยแพร่ข่าวสาร", match: "prefix" })).toBe(true);
  });

  it("marks the จัดบริการ item active on /app/services with any workspace params, and not on the directory", () => {
    const care = project(actor({ roles: [Role.HOSPITAL], hospitalMemberships: [membership(hospitalId, MembershipType.MEMBER)] })).find(({ id }) => id === "care")?.items ?? [];
    const service = care.find(({ label }) => label === "จัดบริการ");

    expect(service).toMatchObject({ href: "/app/services", match: "exact" });
    expect([...resolveActiveNavigationHrefs("/app/services", "hospitalId=x&stage=IN_ROUND&page=2", care)]).toEqual(["/app/services"]);
    expect([...resolveActiveNavigationHrefs("/app/patients", "hospitalId=x", care)]).toEqual(["/app/patients"]);
  });

  it("marks only the OSM task item whose query matches, ignoring unrelated query params", () => {
    const care = project(actor({ roles: [Role.OSM], osmHospitalRelationships: [osm(hospitalId)] })).find(({ id }) => id === "care")?.items ?? [];

    expect([...resolveActiveNavigationHrefs("/app/patients/assigned", "task=screening&hospitalId=x", care)]).toEqual(["/app/patients/assigned?task=screening"]);
    expect([...resolveActiveNavigationHrefs("/app/patients/assigned", "page=2", care)]).toEqual(["/app/patients/assigned"]);
    expect([...resolveActiveNavigationHrefs("/app/patients/provision", "", care)]).toEqual([]);
  });

  it("UI01-G3: highlights only one of นัดหมาย and ประวัติการนัดหมาย for the appointment hub", () => {
    const items = project(actor({ roles: [Role.PATIENT] }))
      .filter(({ workspace }) => workspace === "personal")
      .flatMap((group) => group.items);

    expect([...resolveActiveNavigationHrefs("/app/personal/appointments", "", items)]).toEqual(["/app/personal/appointments"]);
    expect([...resolveActiveNavigationHrefs("/app/personal/appointments", "subject=me&tab=history", items)])
      .toEqual(["/app/personal/appointments?tab=history"]);
    expect([...resolveActiveNavigationHrefs("/app/personal/appointments/rel/appt", "", items)]).toEqual(["/app/personal/appointments"]);
  });
});
