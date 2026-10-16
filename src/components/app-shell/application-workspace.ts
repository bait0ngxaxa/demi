import { HospitalStatus, MembershipStatus } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { ActorHospitalWorkspace } from "@/modules/auth/services/actor-workspace-service";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import {
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
} from "@/modules/patient-provisioning/policies/patient-provisioning-policy";
import { hasPatientActivationHospitalScope } from "@/modules/patient-activation/policies/patient-activation-policy";
import {
  PATIENT_SERVICE_REQUEST_CAPABILITIES,
  decidePatientServiceRequestPolicy,
} from "@/modules/patient-service-requests/policies/patient-service-request-policy";
import {
  decidePatientAccessRequestPolicy,
  PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY,
} from "@/modules/patient-access-requests/policies/patient-access-request-policy";
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
import { projectApplicationNavigation } from "./application-navigation";

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
  administrationScope: "OWNER" | "MEMBER";
};

export type ApplicationWorkspaceProjection = {
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
  const governanceGroup = projectApplicationNavigation(actor).find(
    ({ label }) => label === "ผู้ดูแลระบบ",
  );

  return (
    governanceGroup?.items.map((item) => ({
      href: item.href,
      label: item.label,
      description: navigationDescription(item.href),
      prefetch: item.prefetch,
    })) ?? []
  );
}

function projectAssignedPatientsAction(actor: ActorContext): ApplicationWorkspaceAction | null {
  const assignedPatientsItem = projectApplicationNavigation(actor)
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
      description:
        workforceDecision.reason === "active_hospital_owner"
          ? "จัดการสมาชิกและ อสม. ในโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง"
          : "เพิ่ม อสม. และดูแลการเปิดใช้งานบัญชี อสม. ในโรงพยาบาลที่คุณเป็นสมาชิกโดยตรง",
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
  }

  if (
    hasDirectHospitalProvisioningScope(actor, hospitalId) ||
    hasOsmHospitalProvisioningScope(actor, hospitalId)
  ) {
    actions.push({
      href: withHospitalContext("/app/patients/provision", hospitalId),
      label: hasDirectHospitalProvisioningScope(actor, hospitalId) ? "เพิ่มหรือนำเข้าผู้ป่วย" : "เพิ่มผู้ป่วย",
      description: "เพิ่มผู้ป่วยในโรงพยาบาลนี้ตามสิทธิ์ปัจจุบัน",
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
    decidePatientAccessRequestPolicy({
      actor,
      capability: PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY,
      hospitalId,
    }).allowed
  ) {
    actions.push({
      href: "/app/patients/access-requests",
      label: "คำขอใช้บัญชีผู้ป่วย",
      description: "ตรวจสอบตัวตนและดำเนินคำขอจากโรงพยาบาลที่บัญชีนี้มีสิทธิ์",
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
      label: "บริการที่ผู้ป่วยขอได้",
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
      label: "ข้อมูลติดต่อโรงพยาบาล",
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
      label: "ข่าวสารและความรู้",
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
    administrationScope: actor.hospitalMemberships.some(
      (membership) =>
        membership.hospitalId === workspace.hospitalId &&
        membership.membershipType === "OWNER" &&
        membership.status === MembershipStatus.ACTIVE,
    )
      ? ("OWNER" as const)
      : ("MEMBER" as const),
    actions: workspace.actions.filter((action) => Boolean(action.category)),
  }));

  return {
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
