import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";
import { legalAcceptanceInputSchema, legalChannelSchema } from "@/modules/legal/schemas/legal-schemas";

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
    /** LG-D4: required Terms + Privacy acceptance; an OWNER applicant is offered no consents (LG-D6). */
    acceptLegal: legalAcceptanceInputSchema,
    /** Set by the server transport from the request, never taken from the client body. */
    channel: legalChannelSchema,
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
