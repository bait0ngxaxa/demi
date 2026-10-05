import "server-only";

import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";

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

import { getAvailableApplicationWorkspaces } from "./application-workspace-context";
import type { ApplicationNavigationGroup } from "./navigation-types";

function canManageWorkforce(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    decideWorkforcePolicy({
      actor,
      capability: WORKFORCE_CAPABILITIES.read,
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

function canProvisionPatients(actor: ActorContext): boolean {
  return (
    actor.hospitalMemberships.some(({ hospitalId }) =>
      hasDirectHospitalProvisioningScope(actor, hospitalId),
    ) ||
    actor.osmHospitalRelationships.some(({ hospitalId }) =>
      hasOsmHospitalProvisioningScope(actor, hospitalId),
    )
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

function canReviewPatientRequests(actor: ActorContext): boolean {
  return actor.hospitalMemberships.some(({ hospitalId }) =>
    decidePatientAccessRequestPolicy({
      actor,
      capability: PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY,
      hospitalId,
    }).allowed,
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

export function projectApplicationNavigation(
  actor: ActorContext,
): readonly ApplicationNavigationGroup[] {
  const availableWorkspaces = getAvailableApplicationWorkspaces(actor);
  const hasPersonalWorkspace = availableWorkspaces.includes("personal");
  const hasWorkWorkspace = availableWorkspaces.includes("work");
  const groups: ApplicationNavigationGroup[] = [];

  if (availableWorkspaces.length > 1) {
    groups.push({
      label: "พื้นที่ใช้งาน",
      workspace: "all",
      items: [
        {
          href: "/app/personal",
          label: "ส่วนตัว",
          match: "prefix",
          workspaceContext: "personal",
        },
        {
          href: "/app",
          label: "งาน",
          match: "exact",
          workspaceContext: "work",
        },
      ],
    });
  }

  if (hasPersonalWorkspace) {
    groups.push({
      label: "ส่วนตัว",
      workspace: "personal",
      items: [
        ...(!hasWorkWorkspace
          ? [{ href: "/app/personal", label: "หน้าส่วนตัว", match: "exact" as const }]
          : []),
        { href: "/app/personal/care", label: "ข้อมูลการดูแล", match: "prefix" },
        { href: "/app/personal/services", label: "บริการของฉัน", match: "prefix" },
        { href: "/app/personal/medications", label: "ยาของฉัน", match: "prefix" },
        { href: "/app/personal/wellness", label: "สุขภาพ", match: "prefix" },
        { href: "/app/personal/appointments", label: "นัดหมาย", match: "prefix" },
        { href: "/app/personal/profile", label: "ข้อมูลของฉัน", match: "prefix" },
      ],
    });
  }

  if (hasWorkWorkspace) {
    groups.push({
      label: null,
      workspace: "work",
      items: [{ href: "/app", label: "หน้าหลัก", match: "exact" }],
    });
  } else if (!hasPersonalWorkspace) {
    groups.push({
      label: null,
      items: [{ href: "/app", label: "หน้าหลัก", match: "exact" }],
    });
  }

  if (canManageWorkforce(actor)) {
    groups.push({
      label: "บุคลากร",
      workspace: "work",
      items: [{ href: "/app/workforce", label: "จัดการบุคลากร", match: "prefix" }],
    });
  }

  const hospitalWorkItems = [];
  if (canManageHospitalContact(actor)) {
    hospitalWorkItems.push({ href: "/app/hospitals/contact", label: "ข้อมูลติดต่อโรงพยาบาล", match: "exact" as const });
  }
  if (canManageHospitalContent(actor)) {
    hospitalWorkItems.push({ href: "/app/hospitals/knowledge", label: "ข่าวสารและความรู้", match: "prefix" as const });
  }
  if (hospitalWorkItems.length > 0) {
    groups.push({
      label: "โรงพยาบาล",
      workspace: "work",
      items: hospitalWorkItems,
    });
  }

  const patientItems = [];

  if (canReadAssignedPatients(actor)) {
    patientItems.push({
      href: "/app/patients/assigned",
      label: "ผู้ป่วยที่รับผิดชอบ",
      match: "exact" as const,
    });
  }

  if (canReadPatients(actor)) {
    patientItems.push({
      href: "/app/patients",
      label: "รายชื่อผู้ป่วย",
      match: "exact" as const,
    });
  }

  if (canProvisionPatients(actor)) {
    patientItems.push({
      href: "/app/patients/provision",
      label: "เพิ่ม / นำเข้าผู้ป่วย",
      match: "prefix" as const,
    });
  }

  if (canActivatePatients(actor)) {
    patientItems.push({
      href: "/app/patients/activation",
      label: "เปิดใช้งานบัญชีผู้ป่วย",
      match: "prefix" as const,
    });
  }

  if (canReviewPatientRequests(actor)) {
    patientItems.push({
      href: "/app/patients/access-requests",
      label: "คำขอเปิดใช้งานผู้ป่วย",
      match: "prefix" as const,
    });
  }

  if (canReviewPatientServiceRequests(actor)) {
    patientItems.push({
      href: "/app/patients/service-requests",
      label: "คำขอบริการผู้ป่วย",
      match: "prefix" as const,
    });
  }

  if (canManagePatientServiceCatalog(actor)) {
    patientItems.push({
      href: "/app/patients/service-catalog",
      label: "บริการที่ผู้ป่วยขอได้",
      match: "prefix" as const,
    });
  }

  if (patientItems.length > 0) {
    groups.push({ label: "ผู้ป่วย", items: patientItems, workspace: "work" });
  }

  const canReviewOnboarding = decideHospitalOnboardingPolicy({
    actor,
    capability: HOSPITAL_ONBOARDING_CAPABILITIES.review,
  }).allowed;
  const canReadHospitalGovernance = decideHospitalGovernancePolicy({
    actor,
    capability: HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance,
  }).allowed;

  const adminItems = [];

  if (canReadHospitalGovernance) {
    adminItems.push({
      href: "/app/admin/hospitals",
      label: "การกำกับดูแลโรงพยาบาล",
      match: "prefix" as const,
    });
  }

  if (actor.roles.includes(Role.ADMIN) && canReviewOnboarding) {
    adminItems.push({
      href: "/app/admin/hospital-onboarding",
      label: "คำขอขึ้นทะเบียนโรงพยาบาล",
      match: "prefix" as const,
    });
  }

  if (adminItems.length > 0) {
    groups.push({
      label: "ผู้ดูแลระบบ",
      items: adminItems,
      workspace: "work",
    });
  }

  groups.push({
    label: "ผู้ดูแล",
    items: [{ href: "/app/family", label: "ความสัมพันธ์ผู้ดูแล", match: "prefix" }],
  });

  return groups;
}
