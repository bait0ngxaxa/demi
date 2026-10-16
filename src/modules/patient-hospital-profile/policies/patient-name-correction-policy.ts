export type PatientNameCorrectionBasis = "HOSPITAL_OWNER_SINGLE_HOSPITAL" | "PLATFORM_ADMIN";

export type PatientNameCorrectionDecision =
  | { allowed: true; basis: PatientNameCorrectionBasis }
  | { allowed: false; reason: "not_authorized" | "multi_hospital_requires_admin" };

/**
 * Customer decision E3 (ก-19): Person names are shared across Hospitals. A Hospital OWNER may correct them only
 * when every Hospital relationship of the Person (Patient, staff or OSM) is this Hospital; otherwise only a
 * platform ADMIN may. Inputs must come from the database inside the correcting transaction.
 */
export function decidePatientNameCorrectionPolicy(input: {
  isActivePlatformAdmin: boolean;
  isActiveOwnerOfPatientHospital: boolean;
  patientHospitalId: string;
  personHospitalIds: readonly string[];
}): PatientNameCorrectionDecision {
  if (input.isActivePlatformAdmin) {
    return { allowed: true, basis: "PLATFORM_ADMIN" };
  }

  if (!input.isActiveOwnerOfPatientHospital) {
    return { allowed: false, reason: "not_authorized" };
  }

  const relatedHospitals = new Set(input.personHospitalIds);
  if (relatedHospitals.size !== 1 || !relatedHospitals.has(input.patientHospitalId)) {
    return { allowed: false, reason: "multi_hospital_requires_admin" };
  }

  return { allowed: true, basis: "HOSPITAL_OWNER_SINGLE_HOSPITAL" };
}
