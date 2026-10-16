import type { Prisma } from "@prisma/client";

import { ConflictError } from "@/shared/errors/application-error";

/**
 * Phase F (ก-18): a PatientHospitalRelationship whose care has not ended. Every WORK path (Hospital staff, OSM,
 * caregiver grants, notifications, default report cohort) resolves a Patient through this filter so an ended
 * relationship fails closed. Ended relationships stay readable only for the Patient's own history and for the
 * report cohort the OWNER opts into.
 */
export const activePatientHospitalRelationshipWhere = {
  endedAt: null,
} as const satisfies Prisma.PatientHospitalRelationshipWhereInput;

export function isPatientHospitalRelationshipEnded(relationship: { endedAt: Date | null }): boolean {
  return relationship.endedAt !== null;
}

/** The Person's care with this Hospital ended; it is never reopened implicitly and a platform ADMIN decides. */
export class PatientHospitalRelationshipEndedError extends ConflictError {
  constructor() {
    super("The Patient's care relationship with this Hospital has ended");
    this.name = "PatientHospitalRelationshipEndedError";
  }
}
