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

export const mediatedPasswordResetModeSchema = z.enum(["IN_PERSON", "ONLINE"]);
export const credentialRecoveryVerificationMethodSchema = z.enum([
  "IN_PERSON_ID_CARD",
  "VIDEO_CALL_FACE_AND_ID_CARD",
  "CALLBACK_PHONE_ON_HOSPITAL_RECORD",
]);
export const storedCredentialRecoveryVerificationMethodSchema = z.enum([
  "IN_PERSON_ID_CARD",
  "VIDEO_CALL_FACE_AND_ID_CARD",
  "CALLBACK_PHONE_ON_HOSPITAL_RECORD",
  "BREAK_GLASS_CLI",
  "LINE_ID_TOKEN",
]);
export const mediatedPasswordResetTargetKindSchema = z.enum(["staff", "osm", "patient", "caregiver", "platform_admin"]);

export const mediatedPasswordResetIssueSchema = z
  .object({
    hospitalId: z.uuid(),
    relationshipId: z.uuid().nullable(),
    targetUserId: z.uuid().optional(),
    targetKind: mediatedPasswordResetTargetKindSchema,
    mode: mediatedPasswordResetModeSchema,
    verificationMethod: credentialRecoveryVerificationMethodSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.targetKind === "platform_admin" || input.targetKind === "caregiver") {
      if (!input.targetUserId || input.relationshipId !== null) {
        context.addIssue({ code: "custom", path: ["targetUserId"], message: "A direct user target is required" });
      }
    } else if (!input.relationshipId || input.targetUserId !== undefined) {
      context.addIssue({ code: "custom", path: ["relationshipId"], message: "A target relationship is required" });
    }
  });

export const mediatedPasswordResetSearchSchema = z.object({ nationalId: thaiNationalIdSchema }).strict();

export const mediatedPasswordResetCompletionSchema = z
  .object({
    token: accountRecoveryTokenSchema,
    nationalId: thaiNationalIdSchema,
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

export const linePasswordRecoveryRequestSchema = z.object({ nationalId: thaiNationalIdSchema }).strict();

export const patientHospitalRelationshipIdSchema = z.uuid();

export type AuthenticatedPasswordChangeInput = z.infer<
  typeof authenticatedPasswordChangeSchema
>;
export type AccountRecoveryIssueInput = z.infer<typeof accountRecoveryIssueSchema>;
export type AccountRecoveryCompletionInput = z.infer<
  typeof accountRecoveryCompletionSchema
>;
export type MediatedPasswordResetIssueInput = z.infer<typeof mediatedPasswordResetIssueSchema>;
export type MediatedPasswordResetMode = z.infer<typeof mediatedPasswordResetModeSchema>;
export type CredentialRecoveryVerificationMethod = z.infer<typeof credentialRecoveryVerificationMethodSchema>;
export type StoredCredentialRecoveryVerificationMethod = z.infer<typeof storedCredentialRecoveryVerificationMethodSchema>;
export type MediatedPasswordResetTargetKind = z.infer<typeof mediatedPasswordResetTargetKindSchema>;
export type MediatedPasswordResetCompletionInput = z.infer<typeof mediatedPasswordResetCompletionSchema>;
