import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";

export const patientActivationTokenSchema = z.string().trim().min(1).max(256);

export const patientActivationRequestSchema = z
  .object({
    userId: z.uuid(),
    targetHospitalId: z.uuid(),
    reissue: z.boolean(),
  })
  .strict();

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
export type PatientActivationCompletionInput = z.infer<
  typeof patientActivationCompletionSchema
>;
