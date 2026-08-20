import { z } from "zod";

export const patientProgramRelationshipIdSchema = z.string().uuid();
export const patientProgramIdSchema = z.string().uuid();

export const patientProgramOpenRequestSchema = z
  .object({
    patientHospitalRelationshipId: patientProgramRelationshipIdSchema,
  })
  .strict();

export const patientProgramCompleteRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
  })
  .strict();

export type PatientProgramOpenRequest = z.output<typeof patientProgramOpenRequestSchema>;
export type PatientProgramCompleteRequest = z.output<typeof patientProgramCompleteRequestSchema>;
