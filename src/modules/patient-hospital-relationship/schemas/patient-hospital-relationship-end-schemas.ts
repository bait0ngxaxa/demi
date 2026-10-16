import { z } from "zod";

export const PATIENT_HOSPITAL_RELATIONSHIP_END_REASON_MAX_LENGTH = 500;

/** Phase F (ก-18): the OWNER states why care ends and confirms that history is retained. */
export const patientHospitalRelationshipEndSchema = z
  .object({
    relationshipId: z.string().uuid().transform((value) => value.toLowerCase()),
    endReason: z.string().trim().min(1).max(PATIENT_HOSPITAL_RELATIONSHIP_END_REASON_MAX_LENGTH),
    confirmRetention: z.literal(true),
  })
  .strict();

export type PatientHospitalRelationshipEndInput = z.infer<typeof patientHospitalRelationshipEndSchema>;
