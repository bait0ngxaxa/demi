export type PatientNameCorrectionBasis =
  | "HOSPITAL_OWNER_SINGLE_HOSPITAL"
  | "HOSPITAL_MEMBER_SINGLE_HOSPITAL"
  | "PLATFORM_ADMIN";

export type PatientNameCorrectionDecision =
  | { allowed: true; basis: PatientNameCorrectionBasis }
  | { allowed: false; reason: "not_authorized" | "multi_hospital_requires_admin" };

/**
 * Customer decision E3 (ก-19): Person names are shared across Hospitals. Hospital staff may correct them only
 * when every Hospital relationship of the Person (Patient, staff or OSM) is this Hospital; otherwise only a
 * platform ADMIN may. `hospitalAccessBasis` is the actor's persisted authority in that Hospital: an OWNER or
 * MEMBER for a Patient (ADR-0026), an OWNER only for staff/OSM (UM-1). Inputs must come from the database inside
 * the correcting transaction.
 */
export function decidePatientNameCorrectionPolicy(input: {
  isActivePlatformAdmin: boolean;
  hospitalAccessBasis: "OWNER" | "MEMBER" | null;
  patientHospitalId: string;
  personHospitalIds: readonly string[];
}): PatientNameCorrectionDecision {
  if (input.isActivePlatformAdmin) {
    return { allowed: true, basis: "PLATFORM_ADMIN" };
  }

  if (input.hospitalAccessBasis === null) {
    return { allowed: false, reason: "not_authorized" };
  }

  const relatedHospitals = new Set(input.personHospitalIds);
  if (relatedHospitals.size !== 1 || !relatedHospitals.has(input.patientHospitalId)) {
    return { allowed: false, reason: "multi_hospital_requires_admin" };
  }

  return {
    allowed: true,
    basis: input.hospitalAccessBasis === "OWNER" ? "HOSPITAL_OWNER_SINGLE_HOSPITAL" : "HOSPITAL_MEMBER_SINGLE_HOSPITAL",
  };
}
