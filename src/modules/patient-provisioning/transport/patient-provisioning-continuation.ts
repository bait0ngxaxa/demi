import "server-only";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import { hasPatientActivationHospitalScope } from "@/modules/patient-activation/policies/patient-activation-policy";

export type PatientProvisionContinuation = {
  canOpenPatientDetail: boolean;
  canManagePatientActivation: boolean;
};

export function projectPatientProvisionContinuation(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
): PatientProvisionContinuation {
  return {
    canOpenPatientDetail: hasDirectHospitalPatientReadScope(actor, targetHospitalId),
    canManagePatientActivation: hasPatientActivationHospitalScope(actor, targetHospitalId),
  };
}
