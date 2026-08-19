import { HospitalStatus, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { ActorHospitalWorkspace } from "@/modules/auth/services/actor-workspace-service";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import {
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
} from "@/modules/patient-provisioning/policies/patient-provisioning-policy";
import { hasPatientActivationHospitalScope } from "@/modules/patient-activation/policies/patient-activation-policy";
import {
  decideWorkforcePolicy,
  WORKFORCE_CAPABILITIES,
} from "@/modules/workforce/policies/workforce-policy";

import { projectApplicationNavigation } from "./application-navigation";

export type ApplicationWorkspaceAction = {
  href: string;
  label: string;
  description: string;
};

export type ApplicationHospitalWorkspace = ActorHospitalWorkspace & {
  actions: readonly ApplicationWorkspaceAction[];
};

export type ApplicationWorkspaceProjection = {
  governanceActions: readonly ApplicationWorkspaceAction[];
  assignedPatientsAction: ApplicationWorkspaceAction | null;
  hospitals: readonly ApplicationHospitalWorkspace[];
  patientOnly: boolean;
};

function withHospitalContext(path: string, hospitalId: string): string {
  return `${path}?hospitalId=${encodeURIComponent(hospitalId)}`;
}

function navigationDescription(href: string): string {
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
        description: "เปิดรายชื่อผู้ป่วยที่ได้รับมอบหมายตามขอบเขตปัจจุบัน",
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

  if (
    decideWorkforcePolicy({
      actor,
      capability: WORKFORCE_CAPABILITIES.read,
      targetHospitalId: hospitalId,
    }).allowed
  ) {
    actions.push({
      href: withHospitalContext("/app/workforce", hospitalId),
      label: "จัดการบุคลากร",
      description: "จัดการสมาชิกและ อสม. ในโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง",
    });
  }

  if (hasDirectHospitalPatientReadScope(actor, hospitalId)) {
    actions.push({
      href: withHospitalContext("/app/patients", hospitalId),
      label: "รายชื่อผู้ป่วย",
      description: "ค้นหาและเปิดดูผู้ป่วยในขอบเขตโรงพยาบาลนี้",
    });
  }

  if (
    hasDirectHospitalProvisioningScope(actor, hospitalId) ||
    hasOsmHospitalProvisioningScope(actor, hospitalId)
  ) {
    actions.push({
      href: withHospitalContext("/app/patients/provision", hospitalId),
      label: "เพิ่มผู้ป่วย",
      description: "เพิ่มผู้ป่วยในโรงพยาบาลนี้ตามสิทธิ์ปัจจุบัน",
    });
  }

  if (hasPatientActivationHospitalScope(actor, hospitalId)) {
    actions.push({
      href: withHospitalContext("/app/patients/activation", hospitalId),
      label: "เปิดใช้งานบัญชีผู้ป่วย",
      description: "จัดการการเปิดใช้งานบัญชีผู้ป่วยในโรงพยาบาลนี้",
    });
  }

  return actions;
}

export function projectApplicationWorkspace(
  actor: ActorContext,
  workspaces: readonly ActorHospitalWorkspace[],
): ApplicationWorkspaceProjection {
  const hospitals = workspaces
    .map((workspace) => ({
      ...workspace,
      actions: projectHospitalActions(actor, workspace),
    }))
    .filter(
      (workspace) =>
        workspace.hospitalStatus !== HospitalStatus.ACTIVE || workspace.actions.length > 0,
    );

  return {
    governanceActions: projectGovernanceActions(actor),
    assignedPatientsAction: projectAssignedPatientsAction(actor),
    hospitals,
    patientOnly: actor.roles.length === 1 && actor.roles[0] === Role.PATIENT,
  };
}
