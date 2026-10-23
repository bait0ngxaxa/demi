import { z } from "zod";

import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";
import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";

export const caregiverInvitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const createCaregiverInvitationInputSchema = z
  .object({ nationalId: thaiNationalIdSchema })
  .strict();

export const caregiverAccountClaimInputSchema = z
  .object({
    token: caregiverInvitationTokenSchema,
    nationalId: thaiNationalIdSchema,
    givenName: z.string().trim().min(1).max(120),
    familyName: z.string().trim().min(1).max(120),
    password: userOwnedPasswordSchema,
    passwordConfirmation: userOwnedPasswordSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.password !== input.passwordConfirmation) {
      context.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "Passwords do not match" });
    }
  });

export const caregiverAccountClaimResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ACCEPTED") }).strict(),
  z.object({ status: z.literal("ERROR"), message: z.string().min(1).max(200) }).strict(),
]);

export const caregiverInvitationIdSchema = z
  .object({ invitationId: z.uuid() })
  .strict();

export const caregiverRelationshipIdSchema = z
  .object({ relationshipId: z.uuid() })
  .strict();

export const familyManagementCursorSchema = z
  .object({
    patientInvitationsCursor: z.uuid().optional(),
    patientRelationshipsCursor: z.uuid().optional(),
    caregiverInvitationsCursor: z.uuid().optional(),
    caregiverRelationshipsCursor: z.uuid().optional(),
  })
  .strict();

export type CreateCaregiverInvitationInput = z.infer<
  typeof createCaregiverInvitationInputSchema
>;
export type FamilyManagementCursor = z.infer<typeof familyManagementCursorSchema>;
