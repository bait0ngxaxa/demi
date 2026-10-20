import { HospitalServiceAreaFacilityKind, HospitalStatus } from "@prisma/client";

export type ServiceAreaFacility = {
  id: string;
  status: HospitalStatus;
  parentHospitalId: string | null;
  serviceAreaEligibility: {
    kind: HospitalServiceAreaFacilityKind;
    sourceReference: string;
    verifiedAt: Date;
  } | null;
};

export function hasServiceAreaEligibility(
  facility: ServiceAreaFacility,
  kind: HospitalServiceAreaFacilityKind,
): boolean {
  return facility.status === HospitalStatus.ACTIVE &&
    facility.serviceAreaEligibility?.kind === kind &&
    facility.serviceAreaEligibility.sourceReference.trim().length > 0;
}

/** Canonical placement is a conservative boundary until cross-Parent transfer is approved. */
export function isEligibleServiceAreaPair(parent: ServiceAreaFacility, child: ServiceAreaFacility): boolean {
  return parent.id !== child.id && parent.parentHospitalId === null &&
    child.parentHospitalId === parent.id &&
    hasServiceAreaEligibility(parent, HospitalServiceAreaFacilityKind.PARENT) &&
    hasServiceAreaEligibility(child, HospitalServiceAreaFacilityKind.CHILD);
}
