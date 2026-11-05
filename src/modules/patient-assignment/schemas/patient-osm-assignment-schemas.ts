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

export const PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS = 500;

export const patientOsmBulkAssignmentRequestSchema = z
  .object({
    hospitalId: z.uuid(),
    osmUserId: osmUserIdSchema,
    patientHospitalRelationshipIds: z
      .array(patientHospitalRelationshipIdSchema)
      .min(1)
      .max(PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS)
      .refine((ids) => new Set(ids).size === ids.length),
    submissionNonce: z.uuid(),
  })
  .strict();

/** Patients shown per page of the bulk assignment list; the selection spans pages. */
export const PATIENT_OSM_BULK_ASSIGNMENT_PAGE_SIZE = 25;

/** OSM candidates shown per page of the bulk OSM picker. */
export const PATIENT_OSM_BULK_CANDIDATE_PAGE_SIZE = 10;

/** 1-based page number; a page past the last one is clamped by the service. */
const pageNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .refine(Number.isSafeInteger, "Page must be a safe integer")
  .default(1);

export const patientOsmBulkAssignmentQuerySchema = z
  .object({
    hospitalId: z.uuid(),
    value: optionalCandidateSearchSchema,
    page: pageNumberSchema,
  })
  .strict();

/** Same Hospital, name search and page shape as the patient list. */
export const patientOsmBulkCandidateQuerySchema = patientOsmBulkAssignmentQuerySchema;

export type PatientOsmAssignmentRequest = z.infer<typeof patientOsmAssignmentRequestSchema>;
export type PatientOsmUnassignmentRequest = z.infer<typeof patientOsmUnassignmentRequestSchema>;
export type PatientOsmCandidateQuery = z.infer<typeof patientOsmCandidateQuerySchema>;
export type PatientOsmBulkAssignmentRequest = z.infer<typeof patientOsmBulkAssignmentRequestSchema>;
export type PatientOsmBulkCandidateQuery = z.infer<typeof patientOsmBulkCandidateQuerySchema>;
export type PatientOsmBulkAssignmentQuery = z.infer<typeof patientOsmBulkAssignmentQuerySchema>;
