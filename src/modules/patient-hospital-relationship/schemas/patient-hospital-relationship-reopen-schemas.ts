import { z } from "zod";

import { createThaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

export const PATIENT_HOSPITAL_RELATIONSHIP_REOPEN_REASON_MAX_LENGTH = 500;

const hospitalIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

/** ADR-0032: the platform ADMIN names the Hospital and the Patient's national ID. */
export const patientHospitalRelationshipReopenLookupSchema = z
  .object({
    hospitalId: hospitalIdSchema,
    nationalId: createThaiNationalIdSchema(),
  })
  .strict();

/** ADR-0032: the reopen repeats the lookup, states a reason and confirms the end the ADMIN was shown. */
export const patientHospitalRelationshipReopenSchema = patientHospitalRelationshipReopenLookupSchema
  .extend({
    reopenReason: z.string().trim().min(1).max(PATIENT_HOSPITAL_RELATIONSHIP_REOPEN_REASON_MAX_LENGTH),
    expectedEndedAt: z.iso.datetime(),
  })
  .strict();

export type PatientHospitalRelationshipReopenLookupInput = z.infer<typeof patientHospitalRelationshipReopenLookupSchema>;
export type PatientHospitalRelationshipReopenInput = z.infer<typeof patientHospitalRelationshipReopenSchema>;
