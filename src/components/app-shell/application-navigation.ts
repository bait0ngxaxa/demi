import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import {
  decideHospitalOnboardingPolicy,
  HOSPITAL_ONBOARDING_CAPABILITIES,
} from "@/modules/hospital-onboarding/policies/hospital-onboarding-policy";
import {
  decideHospitalGovernancePolicy,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
} from "@/modules/hospital-governance/policies/hospital-governance-policy";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import {
  hasDirectHospitalProvisioningScope,
} from "@/modules/patient-provisioning/policies/patient-provisioning-policy";
import { hasPatientActivationHospitalScope } from "@/modules/patient-activation/policies/patient-activation-policy";
import {
  PATIENT_SERVICE_REQUEST_CAPABILITIES,
  decidePatientServiceRequestPolicy,
} from "@/modules/patient-service-requests/policies/patient-service-request-policy";
import {
  decideWorkforcePolicy,
  WORKFORCE_CAPABILITIES,
} from "@/modules/workforce/policies/workforce-policy";
import {
  decideHospitalContactPolicy,
  HOSPITAL_CONTACT_CAPABILITIES,
} from "@/modules/hospital-contact/policies/hospital-contact-policy";
import {
  decideHospitalContentPolicy,
  HOSPITAL_CONTENT_CAPABILITIES,
} from "@/modules/hospital-content/policies/hospital-content-policy";
import {
  decideHospitalReportPolicy,
  HOSPITAL_REPORT_CAPABILITIES,
} from "@/modules/reporting/policies/hospital-report-policy";
import {
  decidePatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";
import {
  listActorHospitalWorkspaces,
  type ActorHospitalWorkspace,
} from "@/modules/auth/services/actor-workspace-service";
import { InfrastructureError } from "@/shared/errors/application-error";

import { getAvailableApplicationWorkspaces } from "./application-workspace-context";
import { CUSTOMER_PRIMARY_MENU, CUSTOMER_TOP_MENU, type CustomerMenuId } from "./customer-navigation";
import {
  getNavigationSectionLabel,
  type NavigationAdministrationScope,
} from "./navigation-sections";
import type {
  ApplicationNavigationGroup,
  ApplicationNavigationItem,
  ApplicationWorkspaceContext,
  NavigationSectionId,
} from "./navigation-types";

function canManageWorkforce(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    decideWorkforcePolicy({
      actor,
      capability: WORKFORCE_CAPABILITIES.osmRead,
      targetHospitalId: hospitalId,
    }).allowed,
  );
}

function canManageHospitalContact(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    decideHospitalContactPolicy({
      actor,
      capability: HOSPITAL_CONTACT_CAPABILITIES.read,
      scope: "DIRECT_HOSPITAL_OWNER",
      hospitalId,
    }).allowed,
  );
}

function canReadWorkHospitalContacts(actor: ActorContext): boolean {
  return decideHospitalContactPolicy({
    actor,
    capability: HOSPITAL_CONTACT_CAPABILITIES.read,
    scope: "WORK_HOSPITAL_RELATIONSHIP",
  }).allowed;
}

function canManageHospitalContent(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    decideHospitalContentPolicy({
      actor,
      capability: HOSPITAL_CONTENT_CAPABILITIES.read,
      scope: "DIRECT_HOSPITAL_OWNER",
      hospitalId,
    }).allowed,
  );
}

function canReadHospitalReports(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some((membership) =>
    decideHospitalReportPolicy({
      actor,
      capability: HOSPITAL_REPORT_CAPABILITIES.dashboardRead,
      target: {
        hospitalId: membership.hospitalId,
        hospitalStatus: membership.hospitalStatus,
      },
    }).allowed,
  );
}

// Export-only entry for a MEMBER (OWNERs export from the report page).
function canOnlyExportHospitalReports(actor: ActorContext): boolean {
  return !canReadHospitalReports(actor) && actor.hospitalMemberships.some((membership) =>
    decideHospitalReportPolicy({
      actor,
      capability: HOSPITAL_REPORT_CAPABILITIES.export,
      target: {
        hospitalId: membership.hospitalId,
        hospitalStatus: membership.hospitalStatus,
      },
    }).allowed,
  );
}

function canActivatePatients(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    hasPatientActivationHospitalScope(actor, hospitalId),
  );
}

function canReadPatients(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    hasDirectHospitalPatientReadScope(actor, hospitalId),
  );
}

function canManagePatientServiceCatalog(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    decidePatientServiceRequestPolicy({
      actor,
      capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog,
      hospitalId,
    }).allowed,
  );
}

function canReviewPatientServiceRequests(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    decidePatientServiceRequestPolicy({
      actor,
      capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.review,
      hospitalId,
    }).allowed,
  );
}

function canReadAssignedPatients(actor: ActorContext): boolean {
  return (
    actor.roles.includes(Role.OSM) &&
    actor.osmHospitalRelationships.some(
      ({ status, hospitalStatus }) =>
        status === MembershipStatus.ACTIVE && hospitalStatus === HospitalStatus.ACTIVE,
    )
  );
}

function canReadWorkAppointments(actor: ActorContext): boolean {
  return canReadPatients(actor) || (
    actor.roles.includes(Role.OSM) && actor.osmHospitalRelationships.some(({ status, hospitalStatus }) =>
      status === MembershipStatus.ACTIVE && hospitalStatus === HospitalStatus.ACTIVE)
  );
}

function canAssignOsm(actor: ActorContext): boolean {
  // Same policy the assign-osm page applies to each Hospital it lists (listPatientOsmAssignmentScopes).
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    decidePatientOsmAssignmentPolicy({
      actor,
      capability: PATIENT_ASSIGN_OSM_CAPABILITY,
      targetHospitalId: hospitalId,
    }).allowed,
  );
}

/**
 * The areas page (getParentAreaOverviewContext) admits an active direct OWNER of an active network PARENT
 * (ADR-0015), even before it has Children. The page still re-resolves the network and every Child server-side.
 */
export function canOpenParentAreaOverview(
  actor: ActorContext,
  hospitalWorkspaces: readonly ActorHospitalWorkspace[],
): boolean {
  return actor.roles.includes(Role.HOSPITAL) && hospitalWorkspaces.some((workspace) =>
    workspace.hospitalStatus === HospitalStatus.ACTIVE &&
    workspace.networkRole === "PARENT" &&
    actor.hospitalMemberships.some((membership) =>
      membership.hospitalId === workspace.hospitalId &&
      membership.membershipType === MembershipType.OWNER &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospitalStatus === HospitalStatus.ACTIVE),
  );
}

function hasActiveWorkHospital(actor: ActorContext): boolean {
  return (
    actor.roles.includes(Role.HOSPITAL) && actor.hospitalMemberships.some(({ status, hospitalStatus }) => status === MembershipStatus.ACTIVE && hospitalStatus === HospitalStatus.ACTIVE)
  ) || (
    actor.roles.includes(Role.OSM) && actor.osmHospitalRelationships.some(({ status, hospitalStatus }) => status === MembershipStatus.ACTIVE && hospitalStatus === HospitalStatus.ACTIVE)
  );
}

function isActiveHospitalOwner(actor: ActorContext): boolean {
  return actor.roles.includes(Role.HOSPITAL) && actor.hospitalMemberships.some(({ membershipType, status, hospitalStatus }) =>
    membershipType === MembershipType.OWNER && status === MembershipStatus.ACTIVE && hospitalStatus === HospitalStatus.ACTIVE);
}

/** Platform governance items; the Work Home reads these instead of looking a group up by its label. */
export function projectPlatformGovernanceNavigation(actor: ActorContext): {
  reporting: ApplicationNavigationItem | null;
  hospitals: ApplicationNavigationItem | null;
  onboarding: ApplicationNavigationItem | null;
} {
  const isAdmin = actor.roles.includes(Role.ADMIN);
  return {
    reporting: isAdmin
      ? { href: "/app/admin/reporting", label: "รายงานระบบ", match: "prefix", prefetch: false }
      : null,
    hospitals: decideHospitalGovernancePolicy({
      actor,
      capability: HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance,
    }).allowed
      ? { href: "/app/admin/hospitals", label: "โรงพยาบาลทั้งหมด", match: "prefix" }
      : null,
    onboarding: isAdmin && decideHospitalOnboardingPolicy({
      actor,
      capability: HOSPITAL_ONBOARDING_CAPABILITIES.review,
    }).allowed
      ? { href: "/app/admin/hospital-onboarding", label: "คำขอขึ้นทะเบียน รพ.", match: "prefix" }
      : null,
  };
}

function compact(items: readonly (ApplicationNavigationItem | null | false)[]): ApplicationNavigationItem[] {
  return items.filter((item): item is ApplicationNavigationItem => Boolean(item));
}

function section(
  id: NavigationSectionId,
  workspace: ApplicationWorkspaceContext,
  items: readonly ApplicationNavigationItem[],
  administrationScope?: NavigationAdministrationScope,
): ApplicationNavigationGroup[] {
  return items.length === 0
    ? []
    : [{ id, label: getNavigationSectionLabel(id, workspace, administrationScope), workspace, items }];
}

function projectPersonalSections(): ApplicationNavigationGroup[] {
  return [
    ...section("home", "personal", [{ href: "/app/personal", label: "หน้าส่วนตัว", match: "exact" }]),
    ...section("care", "personal", [
      { href: "/app/personal/appointments", label: "นัดหมาย", match: "prefix" },
      { href: "/app/personal/care", label: "ข้อมูลการดูแล", match: "prefix" },
      { href: "/app/personal/services", label: "คำขอรับบริการ", match: "prefix" },
    ]),
    ...section("health-records", "personal", [
      { href: "/app/personal/medications", label: "ยาของฉัน", match: "prefix" },
      { href: "/app/personal/wellness", label: "อาหารและออกกำลังกาย", match: "prefix" },
      { href: "/app/personal/measurements", label: "ตัวฉันในตอนนี้", match: "prefix" },
    ]),
    ...section("reports-info", "personal", [
      { href: "/app/personal/news", label: "ข่าวสาร", match: "prefix", prefetch: false },
      { href: "/app/personal/knowledge", label: "สื่อความรู้", match: "prefix", prefetch: false },
    ]),
  ];
}

function projectWorkSections(
  actor: ActorContext,
  hospitalWorkspaces: readonly ActorHospitalWorkspace[],
  awaitingOsmAcceptanceCount: number,
): ApplicationNavigationGroup[] {
  const assignedPatients = canReadAssignedPatients(actor);
  const directProvisioning = actor.hospitalMemberships.some(({ hospitalId }) =>
    hasDirectHospitalProvisioningScope(actor, hospitalId),
  );
  const governance = projectPlatformGovernanceNavigation(actor);
  const canReadPatientCare = canReadPatients(actor);
  const hospitalAdministration = compact([
    // UM-1: one OWNER directory over staff, OSM and Patients; the workforce entry stays for adding and importing.
    canManageWorkforce(actor) && { href: "/app/users", label: "จัดการผู้ใช้งาน", match: "prefix" },
    canManageWorkforce(actor) && { href: "/app/workforce", label: "บุคลากร", match: "prefix" },
    canManagePatientServiceCatalog(actor) && { href: "/app/patients/service-catalog", label: "บริการที่เปิดให้ขอ", match: "prefix" },
    canManageHospitalContent(actor) && { href: "/app/hospitals/knowledge", label: "เผยแพร่ข่าวสาร", match: "prefix" },
    canManageHospitalContact(actor) && { href: "/app/hospitals/contact", label: "ข้อมูลติดต่อของ รพ.", match: "exact" },
    // ADR-0016: the same audience as the areas overview (OWNER of an active network PARENT).
    canOpenParentAreaOverview(actor, hospitalWorkspaces) && { href: "/app/hospitals/network", label: "จัดการลูกข่าย", match: "exact", prefetch: false },
  ]);
  const platformAdministration = compact([governance.hospitals, governance.reporting]);
  const administrationScope: NavigationAdministrationScope = hospitalAdministration.length > 0
    ? platformAdministration.length > 0 ? "both" : "hospital"
    : "platform";

  return [
    ...section("home", "work", [{ href: "/app", label: "หน้าหลัก", match: "exact" }]),
    ...section("care", "work", compact([
      canReadWorkAppointments(actor) && { href: "/app/appointments", label: "รายการนัดหมาย", match: "prefix" },
      assignedPatients && { href: "/app/patients/assigned", label: "เพื่อนที่ดูแล", match: "exact", badgeCount: awaitingOsmAcceptanceCount },
      assignedPatients && { href: "/app/patients/assigned?task=screening", label: "รอคัดกรอง", match: "exact" },
      assignedPatients && { href: "/app/patients/assigned?task=followup", label: "รอติดตาม", match: "exact" },
      canReadPatientCare && { href: "/app/patients", label: "รายชื่อผู้ป่วย", match: "exact" },
      canAssignOsm(actor) && { href: "/app/patients/assign-osm", label: "มอบหมาย อสม.", match: "prefix" },
      canReadPatientCare && { href: "/app/patients?task=service", label: "จัดบริการ", match: "exact" },
      canReadPatientCare && { href: "/app/appointments/new", label: "นัดหมายใหม่", match: "exact" },
    ])),
    ...section("registration", "work", compact([
      directProvisioning && { href: "/app/patients/provision", label: "นำเข้าผู้ป่วย", match: "prefix" },
      canActivatePatients(actor) && { href: "/app/patients/activation", label: "เปิดใช้งานบัญชี", match: "prefix" },
    ])),
    ...section("review-queue", "work", compact([
      canReviewPatientServiceRequests(actor) && { href: "/app/patients/service-requests", label: "คำขอรับบริการ", match: "prefix" },
      isActiveHospitalOwner(actor) && { href: "/app/hospitals/support", label: "กล่องแจ้งปัญหา", match: "prefix" },
      governance.onboarding,
    ])),
    ...section("reports-info", "work", compact([
      canReadHospitalReports(actor)
        ? { href: "/app/hospitals/reporting", label: "รายงานโรงพยาบาล", match: "prefix" }
        : canOnlyExportHospitalReports(actor) && { href: "/app/hospitals/reporting/export", label: "ส่งออกรายงาน", match: "exact" },
      canOpenParentAreaOverview(actor, hospitalWorkspaces) && { href: "/app/hospitals/areas", label: "เขตความรับผิดชอบ", match: "exact", prefetch: false },
      hasActiveWorkHospital(actor) && { href: "/app/hospitals/content", label: "ข่าวสารและความรู้", match: "prefix" },
      canReadWorkHospitalContacts(actor) && { href: "/app/hospitals/contacts", label: "ติดต่อโรงพยาบาล", match: "exact" },
    ])),
    ...section("administration", "work", [...hospitalAdministration, ...platformAdministration], administrationScope),
  ];
}

/**
 * UI-01: the general Patient's customer menus (Personal workspace only). Every entry opens an existing Personal route;
 * Hospital OWNER, MEMBER, OSM and Platform ADMIN keep their role navigation in the Work workspace.
 */
const PERSONAL_CUSTOMER_MENU_DESTINATIONS: Readonly<Record<CustomerMenuId, Pick<ApplicationNavigationItem, "href" | "match">>> = {
  home: { href: "/app/personal", match: "exact" },
  health: { href: "/app/personal/measurements", match: "prefix" },
  appointments: { href: "/app/personal/appointments", match: "prefix" },
  followup: { href: "/app/personal/care", match: "prefix" },
  profile: { href: "/app/more", match: "exact" },
  // AF-4 / UI01-G3: the hub's history tab; its own query keeps the two appointment entries from highlighting together.
  "appointment-history": { href: "/app/personal/appointments?tab=history", match: "prefix" },
  family: { href: "/app/family", match: "prefix" },
  medications: { href: "/app/personal/medications", match: "prefix" },
  "food-fitness": { href: "/app/personal/wellness", match: "prefix" },
  contact: { href: "/app/personal#personal-hospital-contact", match: "exact" },
};

function projectPersonalCustomerSections(): ApplicationNavigationGroup[] {
  const items = (menu: readonly { id: CustomerMenuId; label: string }[]): ApplicationNavigationItem[] =>
    menu.map(({ id, label }) => ({ ...PERSONAL_CUSTOMER_MENU_DESTINATIONS[id], label, menuId: id }));

  return [
    ...section("primary", "personal", items(CUSTOMER_PRIMARY_MENU)),
    ...section("top-menu", "personal", items(CUSTOMER_TOP_MENU)),
  ];
}

/**
 * UI-01: in the Personal workspace the customer menus come first; every other Personal item stays a secondary
 * destination in its UI-4 section, minus the Personal home entry and any href a customer menu entry already opens.
 */
function withPersonalCustomerNavigation(groups: readonly ApplicationNavigationGroup[]): ApplicationNavigationGroup[] {
  const customerGroups = projectPersonalCustomerSections();
  const taken = new Set(customerGroups.flatMap(({ items }) => items.map(({ href }) => href)));
  const otherGroups = groups
    .map((group) => group.workspace !== "personal"
      ? group
      : { ...group, items: group.id === "home" ? [] : group.items.filter(({ href }) => !taken.has(href)) })
    .filter(({ items }) => items.length > 0);

  return [...customerGroups, ...otherGroups];
}

/** Shell navigation must not fail the page: without workspace data the areas entry is simply withheld (fail closed). */
export async function listNavigationHospitalWorkspaces(actor: ActorContext): Promise<readonly ActorHospitalWorkspace[]> {
  try {
    return await listActorHospitalWorkspaces(actor);
  } catch (error: unknown) {
    if (error instanceof InfrastructureError) return [];
    throw error;
  }
}

/**
 * UI-4: navigation is organised by task sections in NAVIGATION_SECTION_ORDER. Each item keeps its own policy
 * function; empty sections are omitted. The workspace switch is not a section (see WorkspaceSwitch).
 * `hospitalWorkspaces` only gates the areas entry, whose page decides from persisted hierarchy data.
 */
export function projectApplicationNavigation(
  actor: ActorContext,
  hospitalWorkspaces: readonly ActorHospitalWorkspace[],
  awaitingOsmAcceptanceCount = 0,
): readonly ApplicationNavigationGroup[] {
  const availableWorkspaces = getAvailableApplicationWorkspaces(actor);
  const hasPersonalWorkspace = availableWorkspaces.includes("personal");
  const isCaregiverOnly = actor.roles.length === 1 && actor.roles[0] === Role.CAREGIVER;
  const groups: ApplicationNavigationGroup[] = [
    ...(hasPersonalWorkspace ? projectPersonalSections() : []),
    ...(availableWorkspaces.includes("work") ? projectWorkSections(actor, hospitalWorkspaces, awaitingOsmAcceptanceCount) : []),
  ];

  if (availableWorkspaces.length === 0) {
    groups.push({
      id: "home",
      label: null,
      items: [isCaregiverOnly
        ? { href: "/app/family", label: "ครอบครัวของฉัน", match: "prefix" }
        : { href: "/app", label: "หน้าหลัก", match: "exact" }],
    });
  }

  // Family serves any authenticated account: a delegated caregiver needs no PATIENT role (docs/CONTEXT.md).
  const supportsAccountTools = actor.roles.some((role) =>
    role === Role.PATIENT || role === Role.OSM || role === Role.HOSPITAL || role === Role.CAREGIVER,
  );
  const accountItems = (workspace: ApplicationWorkspaceContext | null): ApplicationNavigationItem[] => compact([
    // The Patient's own profile stays in the Personal workspace, as before UI-4.
    workspace === "personal" && { href: "/app/personal/profile", label: "ข้อมูลของฉัน", match: "prefix" },
    !isCaregiverOnly && { href: "/app/family", label: "ครอบครัวและผู้ดูแล", match: "prefix" },
    supportsAccountTools && { href: "/app/settings", label: "ตั้งค่า", match: "prefix" },
    supportsAccountTools && !isCaregiverOnly && { href: "/app/support", label: "แจ้งปัญหาการใช้งาน", match: "prefix" },
  ]);

  // One account section per workspace: at most one is visible at a time, always last.
  if (availableWorkspaces.length === 0) {
    groups.push({ id: "account", label: getNavigationSectionLabel("account", "work"), items: accountItems(null) });
  }
  for (const workspace of availableWorkspaces) {
    groups.push(...section("account", workspace, accountItems(workspace)));
  }

  return hasPersonalWorkspace ? withPersonalCustomerNavigation(groups) : groups;
}
