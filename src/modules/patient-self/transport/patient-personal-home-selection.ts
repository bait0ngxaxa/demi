import { HospitalStatus } from "@prisma/client";

import type { PatientSelfContext } from "@/modules/patient-self/services/patient-self-query-service";

export type ActivePatientHospital = PatientSelfContext["hospitalRelationships"][number];

type PatientWithHospitalRelationships = {
  hospitalRelationships: readonly ActivePatientHospital[];
};

export function getActivePatientHospitals<T extends PatientWithHospitalRelationships>(
  patient: T,
): Array<T["hospitalRelationships"][number]> {
  return patient.hospitalRelationships.filter(
    ({ careEndedAt, hospitalStatus }) =>
      careEndedAt === null && hospitalStatus === HospitalStatus.ACTIVE,
  );
}

/** Invalid or ended relationship locators fall back to the first database-ordered candidate. */
export function selectPatientPersonalHomeHospital<T extends PatientWithHospitalRelationships>(
  patient: T,
  requestedRelationshipId: unknown,
): T["hospitalRelationships"][number] | null {
  const candidates = getActivePatientHospitals(patient);
  const requested = typeof requestedRelationshipId === "string"
    ? requestedRelationshipId.toLowerCase()
    : null;

  return (
    candidates.find(({ relationshipId }) => relationshipId === requested) ??
    candidates[0] ??
    null
  );
}
