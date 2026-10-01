import { PatientServiceCode } from "@prisma/client";
import { z } from "zod";

export const hospitalServiceOfferingMutationSchema = z
  .object({
    hospitalId: z.uuid(),
    code: z.nativeEnum(PatientServiceCode),
    enabled: z.boolean(),
  })
  .strict();

export const patientServiceRequestCreateSchema = z
  .object({
    relationshipId: z.uuid(),
    offeringId: z.uuid(),
    preferredOsmRelationshipId: z.uuid().nullable().optional(),
  })
  .strict();

export const patientServiceRequestIdSchema = z
  .object({ requestId: z.uuid() })
  .strict();

export type HospitalServiceOfferingMutationInput = z.infer<
  typeof hospitalServiceOfferingMutationSchema
>;
export type PatientServiceRequestCreateInput = z.infer<
  typeof patientServiceRequestCreateSchema
>;
export type PatientServiceRequestIdInput = z.infer<typeof patientServiceRequestIdSchema>;
