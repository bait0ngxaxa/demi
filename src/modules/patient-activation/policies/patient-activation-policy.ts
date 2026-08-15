import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";

export const PATIENT_ACTIVATION_ISSUE_CAPABILITY = "patient:activation:issue" as const;

export type PatientActivationIssueTarget = {
  status: UserStatus;
  authSubject: string | null;
  hasPatientRole: boolean;
  hasPatientProfile: boolean;
  hasHospitalRelationship: boolean;
};

function hasActiveDirectHospitalScope(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
): boolean {
  return Boolean(
    actor?.roles.includes(Role.HOSPITAL) &&
      actor.hospitalMemberships.some(
        (membership) =>
          membership.hospitalId === targetHospitalId &&
          (membership.membershipType === MembershipType.OWNER ||
            membership.membershipType === MembershipType.MEMBER) &&
          membership.status === MembershipStatus.ACTIVE &&
          membership.hospitalStatus === HospitalStatus.ACTIVE,
      ),
  );
}

export function canIssuePatientActivation(
  actor: ActorContext | null | undefined,
  targetPatient: PatientActivationIssueTarget,
  targetHospitalId: string,
): boolean {
  return Boolean(
    actor &&
      actor.roles.includes(Role.HOSPITAL) &&
      hasActiveDirectHospitalScope(actor, targetHospitalId) &&
      targetPatient.hasPatientRole &&
      targetPatient.hasPatientProfile &&
      targetPatient.hasHospitalRelationship &&
      ((targetPatient.status === UserStatus.PROVISIONED && targetPatient.authSubject === null) ||
        (targetPatient.status === UserStatus.ACTIVE && targetPatient.authSubject !== null)),
  );
}

export type PatientActivationPolicyDecision =
  | { allowed: true; reason: "active_direct_hospital_scope" }
  | {
      allowed: false;
      reason:
        | "missing_actor"
        | "invalid_capability"
        | "invalid_target_hospital"
        | "hospital_role_required"
        | "active_direct_hospital_scope_required";
    };

export function decidePatientActivationIssuePolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  targetHospitalId: unknown;
}): PatientActivationPolicyDecision {
  if (!input.actor) {
    return { allowed: false, reason: "missing_actor" };
  }

  if (input.capability !== PATIENT_ACTIVATION_ISSUE_CAPABILITY) {
    return { allowed: false, reason: "invalid_capability" };
  }

  if (typeof input.targetHospitalId !== "string" || !input.targetHospitalId.trim()) {
    return { allowed: false, reason: "invalid_target_hospital" };
  }

  if (!input.actor.roles.includes(Role.HOSPITAL)) {
    return { allowed: false, reason: "hospital_role_required" };
  }

  if (!hasActiveDirectHospitalScope(input.actor, input.targetHospitalId.trim())) {
    return { allowed: false, reason: "active_direct_hospital_scope_required" };
  }

  return { allowed: true, reason: "active_direct_hospital_scope" };
}

export const patientActivationPolicyInternals = { hasActiveDirectHospitalScope };
