import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

export const authenticatedPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: userOwnedPasswordSchema,
    passwordConfirmation: userOwnedPasswordSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.newPassword !== input.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "Password confirmation does not match",
      });
    }
  });

export const accountRecoveryIssueSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    nationalIdConfirmation: thaiNationalIdSchema,
    identityVerified: z.literal(true),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.nationalId !== input.nationalIdConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["nationalIdConfirmation"],
        message: "National ID confirmation does not match",
      });
    }
  });

export const accountRecoveryTokenSchema = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]{43}$/u);

export const accountRecoveryCompletionSchema = z
  .object({
    token: accountRecoveryTokenSchema,
    newPassword: userOwnedPasswordSchema,
    passwordConfirmation: userOwnedPasswordSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.newPassword !== input.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "Password confirmation does not match",
      });
    }
  });

export const patientHospitalRelationshipIdSchema = z.uuid();

export type AuthenticatedPasswordChangeInput = z.infer<
  typeof authenticatedPasswordChangeSchema
>;
export type AccountRecoveryIssueInput = z.infer<typeof accountRecoveryIssueSchema>;
export type AccountRecoveryCompletionInput = z.infer<
  typeof accountRecoveryCompletionSchema
>;
