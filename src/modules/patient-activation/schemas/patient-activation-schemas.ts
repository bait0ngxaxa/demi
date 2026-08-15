import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

export const patientActivationTokenSchema = z.string().trim().min(1).max(256);

export const patientActivationRequestSchema = z
  .object({
    userId: z.uuid(),
    targetHospitalId: z.uuid(),
    reissue: z.boolean(),
  })
  .strict();

export const patientActivationLookupTypeSchema = z.enum([
  "NATIONAL_ID",
  "HOSPITAL_NUMBER",
]);

export const patientActivationLookupSchema = z
  .object({
    targetHospitalId: z.uuid(),
    lookupType: patientActivationLookupTypeSchema,
    value: z.string().trim().min(1).max(64),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.lookupType === "NATIONAL_ID" && !thaiNationalIdSchema.safeParse(input.value).success) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Thai National ID is invalid",
      });
    }
  });

export const patientActivationCompletionSchema = z
  .object({
    password: userOwnedPasswordSchema,
    passwordConfirmation: userOwnedPasswordSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.password !== input.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "Password confirmation does not match",
      });
    }
  });

export type PatientActivationRequestInput = z.infer<typeof patientActivationRequestSchema>;
export type PatientActivationLookupInput = z.infer<typeof patientActivationLookupSchema>;
export type PatientActivationCompletionInput = z.infer<
  typeof patientActivationCompletionSchema
>;
