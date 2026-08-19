import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

export const hospitalCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/, "Hospital code is invalid");

const personNameSchema = z.string().trim().min(1).max(120);

export const hospitalOnboardingSubmissionSchema = z
  .object({
    hospitalCode: hospitalCodeSchema,
    nationalId: thaiNationalIdSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    password: userOwnedPasswordSchema,
    passwordConfirmation: userOwnedPasswordSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.password !== input.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน",
      });
    }
  });

export const hospitalOnboardingApplicationIdSchema = z.uuid();

export const hospitalOnboardingRejectionSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => value || undefined);

export type HospitalOnboardingSubmissionInput = z.infer<
  typeof hospitalOnboardingSubmissionSchema
>;
export type HospitalOnboardingApplicationId = z.infer<
  typeof hospitalOnboardingApplicationIdSchema
>;
