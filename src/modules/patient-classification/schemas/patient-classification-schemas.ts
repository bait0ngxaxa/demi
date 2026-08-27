import { z } from "zod";

export const PATIENT_CLASSIFICATION_TYPES = ["RISK", "DIABETES"] as const;
export const PATIENT_CLASSIFICATION_SOURCES = ["ROSTER_IMPORT", "MANUAL"] as const;

export const patientClassificationTypeSchema = z.enum(PATIENT_CLASSIFICATION_TYPES);
export const patientClassificationSourceSchema = z.enum(PATIENT_CLASSIFICATION_SOURCES);
export const patientClassificationRelationshipIdSchema = z.uuid();

export const setPatientClassificationRequestSchema = z
  .object({
    patientHospitalRelationshipId: patientClassificationRelationshipIdSchema,
    classification: patientClassificationTypeSchema,
  })
  .strict();

export type PatientClassificationType = z.infer<typeof patientClassificationTypeSchema>;
export type PatientClassificationSource = z.infer<typeof patientClassificationSourceSchema>;
export type SetPatientClassificationRequest = z.infer<
  typeof setPatientClassificationRequestSchema
>;
