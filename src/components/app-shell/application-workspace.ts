import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { ActorHospitalWorkspace } from "@/modules/auth/services/actor-workspace-service";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import {
  hasDirectHospitalProvisioningScope,
} from "@/modules/patient-provisioning/policies/patient-provisioning-policy";
import {
  PATIENT_SERVICE_REQUEST_CAPABILITIES,
  decidePatientServiceRequestPolicy,
} from "@/modules/patient-service-requests/policies/patient-service-request-policy";
import {
  decideWorkforcePolicy,
  WORKFORCE_CAPABILITIES,
} from "@/modules/workforce/policies/workforce-policy";
import {
  decideHospitalContentPolicy,
  HOSPITAL_CONTENT_CAPABILITIES,
} from "@/modules/hospital-content/policies/hospital-content-policy";
import {
  decideHospitalReportPolicy,
  HOSPITAL_REPORT_CAPABILITIES,
} from "@/modules/reporting/policies/hospital-report-policy";

import { getAvailableApplicationWorkspaces } from "./application-workspace-context";
import type {
  ApplicationNavigationGroup,
  ApplicationNavigationItem,
  ApplicationWorkspaceContext,
} from "./navigation-types";
import { canOpenHospitalSettings, projectApplicationNavigation, projectPlatformGovernanceNavigation } from "./application-navigation";

export type ApplicationWorkspaceAction = {
  href: string;
  label: string;
  description: string;
  category?: "care" | "patient" | "information" | "administration";
  prefetch?: boolean;
};

export type ApplicationHospitalWorkspace = ActorHospitalWorkspace & {
  actions: readonly ApplicationWorkspaceAction[];
  contextLabel: string;
};

/** STAFF-04 work-area selector group: the actor's own direct work contexts under one parent network. */
export type ApplicationWorkAreaGroup = {
  network: { hospitalId: string; name: string };
  hospitals: readonly { hospitalId: string; hospitalName: string }[];
};

export type ApplicationWorkspaceProjection = {
  areaGroups: readonly ApplicationWorkAreaGroup[];
  availableWorkspaces: readonly ApplicationWorkspaceContext[];
  governanceActions: readonly ApplicationWorkspaceAction[];
  assignedPatientsAction: ApplicationWorkspaceAction | null;
  hospitals: readonly ApplicationHospitalWorkspace[];
  requestActions: readonly ApplicationWorkspaceAction[];
  supportingActions: readonly ApplicationWorkspaceAction[];
};

function withHospitalContext(path: string, hospitalId: string): string {
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex < 0 ? path : path.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex < 0 ? "" : path.slice(queryIndex + 1));
  params.set("hospitalId", hospitalId);
  return `${pathname}?${params.toString()}`;
}

function navigationItemsForSections(
  navigation: readonly ApplicationNavigationGroup[],
  sectionIds: readonly ApplicationNavigationGroup["id"][],
): ApplicationNavigationItem[] {
  return navigation
    .filter(({ id, workspace }) => sectionIds.includes(id) && workspace === "work")
    .flatMap(({ items }) => items);
}

function isDirectHospitalCareItem(item: ApplicationNavigationItem): boolean {
  const [pathname = "", query = ""] = item.href.split("?", 2);
  if (pathname === "/app/appointments" || pathname === "/app/appointments/new" || pathname === "/app/services") return true;
  return pathname === "/app/patients" && !new URLSearchParams(query).has("task");
}

function careActionDescription(item: ApplicationNavigationItem): string {
  if (item.href === "/app/appointments") return "ดูนัดหมายของโรงพยาบาลนี้";
  if (item.href === "/app/appointments/new") return "เลือกผู้ป่วยและบันทึกนัดหมายใหม่ในโรงพยาบาลนี้";
  if (item.href === "/app/patients") return "ค้นหาและเลือกผู้ป่วยในโรงพยาบาลนี้เพื่อเปิดข้อมูลและดูแลต่อเนื่อง";
  if (item.href === "/app/services") return "ติดตามความคืบหน้าและเริ่มขั้นตอนถัดไปของผู้ป่วยแต่ละคน";
  return "เปิดงานดูแลผู้ป่วยในโรงพยาบาลนี้";
}

function isActiveOsmAtHospital(actor: ActorContext, hospitalId: string): boolean {
  return actor.roles.includes(Role.OSM) && actor.osmHospitalRelationships.some((relationship) =>
    relationship.hospitalId === hospitalId &&
    relationship.status === MembershipStatus.ACTIVE &&
    relationship.hospitalStatus === HospitalStatus.ACTIVE,
  );
}

function projectHospitalCareActions(
  actor: ActorContext,
  workspace: ActorHospitalWorkspace,
  navigation: readonly ApplicationNavigationGroup[],
): ApplicationWorkspaceAction[] {
  const hasDirectPatientScope = hasDirectHospitalPatientReadScope(actor, workspace.hospitalId);
  const hasOsmAppointmentScope = isActiveOsmAtHospital(actor, workspace.hospitalId);

  return navigationItemsForSections(navigation, ["care"])
    .filter((item) => hasDirectPatientScope
      ? isDirectHospitalCareItem(item)
      : hasOsmAppointmentScope && (item.href === "/app/appointments" || item.href === "/app/services"))
    .map((item) => ({
      href: withHospitalContext(item.href, workspace.hospitalId),
      label: item.label,
      description: careActionDescription(item),
      category: "care",
      ...(item.prefetch === undefined ? {} : { prefetch: item.prefetch }),
    }));
}

function navigationDescription(href: string): string {
  if (href === "/app/admin/reporting") {
    return "เลือกโรงพยาบาลเพื่อดูรายงานตามสิทธิ์ผู้ดูแลระบบ";
  }
  if (href === "/app/admin/hospital-onboarding") {
    return "ตรวจสอบและตัดสินคำขอขึ้นทะเบียนโรงพยาบาล";
  }

  return "ดูสถานะและกำกับดูแลโรงพยาบาลตามสิทธิ์ผู้ดูแลระบบ";
}

function projectGovernanceActions(actor: ActorContext): ApplicationWorkspaceAction[] {
  const { reporting, hospitals, onboarding } = projectPlatformGovernanceNavigation(actor);

  return [reporting, hospitals, onboarding].flatMap((item) => item
    ? [{
        href: item.href,
        label: item.label,
        description: navigationDescription(item.href),
        prefetch: item.prefetch,
      }]
    : []);
}

function projectAssignedPatientsAction(navigation: readonly ApplicationNavigationGroup[]): ApplicationWorkspaceAction | null {
  const assignedPatientsItem = navigation
    .flatMap((group) => group.items)
    .find((item) => item.href === "/app/patients/assigned");

  return assignedPatientsItem
    ? {
        href: assignedPatientsItem.href,
        label: assignedPatientsItem.label,
        description: "เลือกผู้ป่วยที่ได้รับมอบหมายเพื่อเปิดข้อมูลและดูแลต่อเนื่อง สิทธิ์ตรวจตามผู้ป่วยและโรงพยาบาลแต่ละราย",
      }
    : null;
}

function projectHospitalActions(
  actor: ActorContext,
  workspace: ActorHospitalWorkspace,
  navigation: readonly ApplicationNavigationGroup[],
): ApplicationWorkspaceAction[] {
  if (workspace.hospitalStatus !== HospitalStatus.ACTIVE) {
    return [];
  }

  const { hospitalId } = workspace;
  const actions: ApplicationWorkspaceAction[] = projectHospitalCareActions(actor, workspace, navigation);

  const workforceDecision = decideWorkforcePolicy({
    actor,
    capability: WORKFORCE_CAPABILITIES.osmRead,
    targetHospitalId: hospitalId,
  });

  if (workforceDecision.allowed) {
    actions.push({
      href: withHospitalContext("/app/users", hospitalId),
      label: "ผู้ใช้และสิทธิ์",
      description: "ดูสถานะและจัดการบัญชีเจ้าหน้าที่ อสม. และผู้ป่วยในโรงพยาบาลนี้",
      category: "administration",
    });
  }

  if (canOpenHospitalSettings(actor, hospitalId)) {
    actions.push({
      href: withHospitalContext("/app/hospitals/settings", hospitalId),
      label: "ตั้งค่าโรงพยาบาล",
      description: "จัดการข้อมูลติดต่อ บริการที่เปิดให้ขอ และการลงทะเบียนเองตามสิทธิ์ของคุณ",
      category: "administration",
      prefetch: false,
    });
  }

  if (hasDirectHospitalPatientReadScope(actor, hospitalId)) {
    const informationItems = navigationItemsForSections(navigation, ["reports-info"]);
    for (const item of informationItems) {
      if (item.href === "/app/hospitals/content") {
        actions.push({
          href: withHospitalContext(item.href, hospitalId),
          label: item.label,
          description: "อ่านข่าวสารและความรู้จากโรงพยาบาลนี้",
          category: "information",
          ...(item.prefetch === undefined ? {} : { prefetch: item.prefetch }),
        });
      } else if (item.href === "/app/hospitals/contacts") {
        actions.push({
          href: withHospitalContext(item.href, hospitalId),
          label: item.label,
          description: "ดูข้อมูลติดต่อของโรงพยาบาลนี้",
          category: "information",
          ...(item.prefetch === undefined ? {} : { prefetch: item.prefetch }),
        });
      }
    }
  }

  if (hasDirectHospitalProvisioningScope(actor, hospitalId)) {
    actions.push({
      href: withHospitalContext("/app/patients/provision", hospitalId),
      label: "นำเข้าผู้ป่วย",
      description: "นำเข้ารายชื่อผู้ป่วยจาก Excel ในโรงพยาบาลนี้",
      category: "patient",
    });
  }

  if (
    decidePatientServiceRequestPolicy({
      actor,
      capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.review,
      hospitalId,
    }).allowed
  ) {
    actions.push({
      href: "/app/patients/service-requests",
      label: "คำขอบริการผู้ป่วย",
      description: "ทบทวนคำขอบริการจากโรงพยาบาลที่บัญชีนี้มีสิทธิ์",
    });
  }

  if (decideHospitalContentPolicy({
    actor,
    capability: HOSPITAL_CONTENT_CAPABILITIES.read,
    scope: "DIRECT_HOSPITAL_OWNER",
    hospitalId,
  }).allowed) {
    actions.push({
      href: withHospitalContext("/app/hospitals/knowledge", hospitalId),
      label: "เผยแพร่ข่าวสาร",
      description: "สร้างฉบับร่างและจัดการการเผยแพร่เนื้อหาของโรงพยาบาลนี้",
      category: "administration",
      prefetch: false,
    });
  }
  if (decideHospitalReportPolicy({
    actor,
    capability: HOSPITAL_REPORT_CAPABILITIES.dashboardRead,
    target: { hospitalId, hospitalStatus: workspace.hospitalStatus },
  }).allowed) {
    actions.push({
      href: withHospitalContext("/app/hospitals/reporting", hospitalId),
      label: "รายงานโรงพยาบาล",
      description: "เปิดรายงานโรงพยาบาลนี้ เลือกรายงานลูกข่ายที่มีสิทธิ์ได้ในหน้ารายงาน โดยไม่เพิ่มสิทธิ์ดูแลผู้ป่วยลูกข่าย",
      category: "administration",
      prefetch: false,
    });
    // ADR-0016: a network Parent OWNER manages its Children; the page re-resolves persisted authority.
    if (workspace.networkRole === "PARENT") {
      actions.push({
        href: withHospitalContext("/app/hospitals/network", hospitalId),
        label: "จัดการลูกข่าย",
        description: "เพิ่มหรือนำ รพ.สต. และหน่วยบริการลูกข่ายออกจากเครือข่าย และเปิดดูผู้ป่วยของลูกข่ายแบบอ่านอย่างเดียว",
        category: "administration",
        prefetch: false,
      });
    }
    // Only a Parent with active network Children has responsibility areas to show.
    if (workspace.hasActiveDirectChildren) {
      actions.push({
        href: "/app/hospitals/reporting?scope=network",
        label: "รายงานลูกข่าย",
        description: "ดูและดาวน์โหลดตัวเลขสรุปของโรงพยาบาลลูกข่ายในเครือข่าย",
        category: "administration",
        prefetch: false,
      });
    }
  } else if (decideHospitalReportPolicy({
    actor,
    capability: HOSPITAL_REPORT_CAPABILITIES.export,
    target: { hospitalId, hospitalStatus: workspace.hospitalStatus },
  }).allowed) {
    // The export page resolves every authorized Hospital itself and rejects query parameters; keep its existing URL.
    const exportItem = navigationItemsForSections(navigation, ["reports-info"])
      .find(({ href }) => href === "/app/hospitals/reporting/export");
    if (exportItem) {
      actions.push({
        href: exportItem.href,
        label: exportItem.label,
        description: "ดาวน์โหลดไฟล์รายงานโรงพยาบาล (Excel) ของผู้ป่วยที่ยังอยู่ในการดูแล",
        category: "patient",
        ...(exportItem.prefetch === undefined ? {} : { prefetch: exportItem.prefetch }),
      });
    }
  }

  return actions;
}

export function projectApplicationWorkspace(
  actor: ActorContext,
  workspaces: readonly ActorHospitalWorkspace[],
  navigation: readonly ApplicationNavigationGroup[] = projectApplicationNavigation(actor, workspaces),
): ApplicationWorkspaceProjection {
  const projected = workspaces.map((workspace) => ({
    ...workspace,
    actions: projectHospitalActions(actor, workspace, navigation),
  }));
  // These destinations resolve the actor's full permitted scope, not a selected Hospital.
  const shared = new Map<string, ApplicationWorkspaceAction>();
  for (const workspace of projected) {
    for (const action of workspace.actions) {
      if (!action.category) shared.set(action.href, action);
    }
  }
  const hospitals = projected.map((workspace) => ({
    ...workspace,
    contextLabel: workspaceContextLabel(actor, workspace.hospitalId),
    actions: workspace.actions.filter((action) => Boolean(action.category)),
  }));

  return {
    areaGroups: projectWorkAreaGroups(actor, workspaces),
    availableWorkspaces: getAvailableApplicationWorkspaces(actor),
    governanceActions: projectGovernanceActions(actor),
    assignedPatientsAction: projectAssignedPatientsAction(navigation),
    hospitals,
    requestActions: [...shared.values()],
    supportingActions: [],
  };
}

function hasActiveDirectWorkRelationship(actor: ActorContext, hospitalId: string): boolean {
  return (
    actor.roles.includes(Role.HOSPITAL) && actor.hospitalMemberships.some((membership) =>
      membership.hospitalId === hospitalId &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospitalStatus === HospitalStatus.ACTIVE)
  ) || (
    actor.roles.includes(Role.OSM) && actor.osmHospitalRelationships.some((relationship) =>
      relationship.hospitalId === hospitalId &&
      relationship.status === MembershipStatus.ACTIVE &&
      relationship.hospitalStatus === HospitalStatus.ACTIVE)
  );
}

/**
 * ADR-0013 §2 (STAFF-04): selectable work areas come only from the actor's current active direct Hospital memberships
 * and OSM relationships, grouped by parent network. A Parent membership never adds its Children as work contexts.
 */
function projectWorkAreaGroups(
  actor: ActorContext,
  workspaces: readonly ActorHospitalWorkspace[],
): ApplicationWorkAreaGroup[] {
  const groups = new Map<string, { network: ApplicationWorkAreaGroup["network"]; hospitals: { hospitalId: string; hospitalName: string }[] }>();
  for (const workspace of workspaces) {
    if (workspace.hospitalStatus !== HospitalStatus.ACTIVE || !hasActiveDirectWorkRelationship(actor, workspace.hospitalId)) {
      continue;
    }
    const group = groups.get(workspace.network.hospitalId)
      ?? { network: workspace.network, hospitals: [] };
    group.hospitals.push({ hospitalId: workspace.hospitalId, hospitalName: workspace.hospitalName });
    groups.set(workspace.network.hospitalId, group);
  }
  return [...groups.values()].sort((left, right) =>
    left.network.name.localeCompare(right.network.name, "th") || left.network.hospitalId.localeCompare(right.network.hospitalId),
  );
}

function workspaceContextLabel(actor: ActorContext, hospitalId: string): string {
  const labels = actor.hospitalMemberships
    .filter((membership) => membership.hospitalId === hospitalId)
    .map((membership) => `${membership.membershipType === "OWNER" ? "เจ้าของโรงพยาบาล" : "สมาชิกโรงพยาบาล"}${membership.status !== MembershipStatus.ACTIVE ? " (สมาชิกไม่พร้อมใช้งาน)" : ""}`);
  const relationship = actor.osmHospitalRelationships.find((item) => item.hospitalId === hospitalId);
  if (relationship) {
    labels.push(`อสม. ที่สัมพันธ์กับโรงพยาบาล${relationship.status !== MembershipStatus.ACTIVE ? " (ความสัมพันธ์ไม่พร้อมใช้งาน)" : ""}`);
  }
  return labels.join(" · ");
}
