import { z } from "zod";

export const PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH = 120;

const patientHospitalRelationshipIdSchema = z.uuid();
const osmUserIdSchema = z.uuid();

export const patientOsmAssignmentRequestSchema = z
  .object({
    patientHospitalRelationshipId: patientHospitalRelationshipIdSchema,
    osmUserId: osmUserIdSchema,
  })
  .strict();

export const patientOsmUnassignmentRequestSchema = z
  .object({
    patientHospitalRelationshipId: patientHospitalRelationshipIdSchema,
  })
  .strict();

const optionalCandidateSearchSchema = z.preprocess(
  (value: unknown) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized || undefined;
  },
  z.string().max(PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH).optional(),
);

export const patientOsmCandidateQuerySchema = z
  .object({
    patientHospitalRelationshipId: patientHospitalRelationshipIdSchema,
    value: optionalCandidateSearchSchema,
  })
  .strict();

export type PatientOsmAssignmentRequest = z.infer<typeof patientOsmAssignmentRequestSchema>;
export type PatientOsmUnassignmentRequest = z.infer<typeof patientOsmUnassignmentRequestSchema>;
export type PatientOsmCandidateQuery = z.infer<typeof patientOsmCandidateQuerySchema>;
