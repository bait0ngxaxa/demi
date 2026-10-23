import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { ActorHospitalWorkspace } from "@/modules/auth/services/actor-workspace-service";
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

import { getAvailableApplicationWorkspaces } from "./application-workspace-context";
import type { ApplicationWorkspaceContext } from "./navigation-types";
import { projectApplicationNavigation, projectPlatformGovernanceNavigation } from "./application-navigation";

export type ApplicationWorkspaceAction = {
  href: string;
  label: string;
  description: string;
  category?: "care" | "patient" | "administration";
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
  return `${path}?hospitalId=${encodeURIComponent(hospitalId)}`;
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

function projectAssignedPatientsAction(actor: ActorContext): ApplicationWorkspaceAction | null {
  // Hospital workspaces only gate the areas entry, which this lookup does not read.
  const assignedPatientsItem = projectApplicationNavigation(actor, [])
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
): ApplicationWorkspaceAction[] {
  if (workspace.hospitalStatus !== HospitalStatus.ACTIVE) {
    return [];
  }

  const { hospitalId } = workspace;
  const actions: ApplicationWorkspaceAction[] = [];

  const workforceDecision = decideWorkforcePolicy({
    actor,
    capability: WORKFORCE_CAPABILITIES.osmRead,
    targetHospitalId: hospitalId,
  });

  if (workforceDecision.allowed) {
    actions.push({
      href: withHospitalContext("/app/workforce", hospitalId),
      label: "จัดการบุคลากร",
      description: "จัดการสมาชิกและ อสม. ในโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง",
      category: "administration",
    });
  }

  if (hasDirectHospitalPatientReadScope(actor, hospitalId)) {
    actions.push({
      href: withHospitalContext("/app/patients", hospitalId),
      label: "รายชื่อผู้ป่วย",
      description: "ค้นหาและเลือกผู้ป่วยในโรงพยาบาลนี้เพื่อเปิดข้อมูลและดูแลต่อเนื่อง",
      category: "care",
    });
    actions.push({
      href: withHospitalContext("/app/appointments", hospitalId),
      label: "รายการนัดหมาย",
      description: "ดูนัดหมายและคำขอที่รอดำเนินการในโรงพยาบาลนี้",
      category: "care",
    });
  }

  if (
    !hasDirectHospitalPatientReadScope(actor, hospitalId) &&
    actor.roles.includes(Role.OSM) && actor.osmHospitalRelationships.some((relationship) =>
      relationship.hospitalId === hospitalId &&
      relationship.status === MembershipStatus.ACTIVE &&
      relationship.hospitalStatus === HospitalStatus.ACTIVE)
  ) {
    actions.push({
      href: withHospitalContext("/app/appointments", hospitalId),
      label: "รายการนัดหมาย",
      description: "ดูนัดหมายของผู้ป่วยที่ได้รับมอบหมายในโรงพยาบาลนี้",
      category: "care",
    });
  }

  if (hasDirectHospitalProvisioningScope(actor, hospitalId)) {
    actions.push({
      href: withHospitalContext("/app/patients/provision", hospitalId),
      label: "นำเข้าผู้ป่วย",
      description: "นำเข้ารายชื่อผู้ป่วยจาก Excel ในโรงพยาบาลนี้",
      category: "patient",
    });
  }

  if (hasPatientActivationHospitalScope(actor, hospitalId)) {
    actions.push({
      href: withHospitalContext("/app/patients/activation", hospitalId),
      label: "เปิดใช้งานบัญชีผู้ป่วย",
      description: "จัดการการเปิดใช้งานบัญชีผู้ป่วยในโรงพยาบาลนี้",
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

  if (
    decidePatientServiceRequestPolicy({
      actor,
      capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.manageCatalog,
      hospitalId,
    }).allowed
  ) {
    actions.push({
      href: "/app/patients/service-catalog",
      label: "บริการที่เปิดให้ขอ",
      description: "กำหนดบริการในโรงพยาบาลที่บัญชีนี้มีสิทธิ์จัดการ",
    });
  }

  if (decideHospitalContactPolicy({
    actor,
    capability: HOSPITAL_CONTACT_CAPABILITIES.read,
    scope: "DIRECT_HOSPITAL_OWNER",
    hospitalId,
  }).allowed) {
    actions.push({
      href: withHospitalContext("/app/hospitals/contact", hospitalId),
      label: "ข้อมูลติดต่อของ รพ.",
      description: "ปรับปรุงที่อยู่และโทรศัพท์ที่โรงพยาบาลนี้ให้ไว้สำหรับผู้ป่วย",
      category: "administration",
      prefetch: false,
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
        href: "/app/hospitals/areas",
        label: "เขตความรับผิดชอบ",
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
    // The export page lists every Hospital where the actor is a MEMBER, so it is a shared (uncategorized) action.
    actions.push({
      href: "/app/hospitals/reporting/export",
      label: "ส่งออกรายงาน",
      description: "ดาวน์โหลดไฟล์รายงานโรงพยาบาล (Excel) ของผู้ป่วยที่ยังอยู่ในการดูแล",
      prefetch: false,
    });
  }

  return actions;
}

export function projectApplicationWorkspace(
  actor: ActorContext,
  workspaces: readonly ActorHospitalWorkspace[],
): ApplicationWorkspaceProjection {
  const projected = workspaces.map((workspace) => ({
    ...workspace,
    actions: projectHospitalActions(actor, workspace),
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
    assignedPatientsAction: projectAssignedPatientsAction(actor),
    hospitals,
    requestActions: [...shared.values()].filter(({ href }) => href !== "/app/patients/service-catalog"),
    supportingActions: [
      ...[...shared.values()].filter(({ href }) => href === "/app/patients/service-catalog"),
    ],
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
