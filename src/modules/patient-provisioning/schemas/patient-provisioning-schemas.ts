import { z } from "zod";

import {
  identityReferenceSchema,
  thaiNationalIdSchema,
} from "@/modules/identity/schemas/identity-schemas";

const personNameSchema = z.string().trim().min(1).max(120);

const optionalHospitalNumberSchema = z.preprocess(
  (value: unknown) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized || undefined;
  },
  z.string().max(64).optional(),
);

export const patientProvisionInputSchema = z
  .object({
    identity: identityReferenceSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    targetHospitalId: z.uuid(),
    hospitalNumber: optionalHospitalNumberSchema,
  })
  .strict();

export const patientProvisionFormSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    targetHospitalId: z.uuid(),
    hospitalNumber: optionalHospitalNumberSchema,
  })
  .strict();

export const patientProvisionScopeSchema = z
  .object({ targetHospitalId: z.uuid() })
  .strict();

export const patientImportFileSchema = z
  .object({ targetHospitalId: z.uuid() })
  .strict();

export type ProvisionPatientInput = z.infer<typeof patientProvisionInputSchema>;
export type PatientProvisionFormInput = z.infer<typeof patientProvisionFormSchema>;
export type PatientProvisionScopeInput = z.infer<typeof patientProvisionScopeSchema>;
