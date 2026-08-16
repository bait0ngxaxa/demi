import "server-only";

import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";

import {
  decideHospitalOnboardingPolicy,
  HOSPITAL_ONBOARDING_CAPABILITIES,
} from "@/modules/hospital-onboarding/policies/hospital-onboarding-policy";
import type { ActorContext } from "@/modules/auth/types/actor-context";
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
  const groups: ApplicationNavigationGroup[] = [
    {
      label: null,
      items: [{ href: "/app", label: "หน้าหลัก", match: "exact" }],
    },
  ];

  if (canManageWorkforce(actor)) {
    groups.push({
      label: "บุคลากร",
      items: [{ href: "/app/workforce", label: "จัดการบุคลากร", match: "prefix" }],
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

  if (patientItems.length > 0) {
    groups.push({ label: "ผู้ป่วย", items: patientItems });
  }

  const canReviewOnboarding = decideHospitalOnboardingPolicy({
    actor,
    capability: HOSPITAL_ONBOARDING_CAPABILITIES.review,
  }).allowed;

  if (actor.roles.includes(Role.ADMIN) && canReviewOnboarding) {
    groups.push({
      label: "ผู้ดูแลระบบ",
      items: [
        {
          href: "/app/admin/hospital-onboarding",
          label: "คำขอขึ้นทะเบียนโรงพยาบาล",
          match: "prefix",
        },
      ],
    });
  }

  return groups;
}
