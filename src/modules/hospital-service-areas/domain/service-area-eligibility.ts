import { HospitalServiceAreaFacilityKind, HospitalStatus } from "@prisma/client";

export type ServiceAreaFacility = {
  id: string;
  status: HospitalStatus;
  serviceAreaEligibility: { kind: HospitalServiceAreaFacilityKind } | null;
};

export function hasServiceAreaEligibility(
  facility: ServiceAreaFacility,
  kind: HospitalServiceAreaFacilityKind,
): boolean {
  return facility.status === HospitalStatus.ACTIVE && facility.serviceAreaEligibility?.kind === kind;
}

/** ADR-0015: the ADMIN-governed network role decides eligibility; canonical placement is reference data only. */
export function isEligibleServiceAreaPair(parent: ServiceAreaFacility, child: ServiceAreaFacility): boolean {
  return parent.id !== child.id &&
    hasServiceAreaEligibility(parent, HospitalServiceAreaFacilityKind.PARENT) &&
    hasServiceAreaEligibility(child, HospitalServiceAreaFacilityKind.CHILD);
}
