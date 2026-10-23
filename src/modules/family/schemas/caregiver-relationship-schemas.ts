import { z } from "zod";

import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";
import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";

import { CAREGIVER_RELATIONSHIP_LABEL_OTHER_MAX } from "../domain/caregiver-sharing-contract";

export const caregiverInvitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const caregiverRelationshipLabelSchema = z.enum(["SPOUSE", "CHILD", "PARENT", "SIBLING", "GRANDCHILD", "RELATIVE", "OTHER"]);
export const caregiverResourceSchema = z.enum(["PROFILE_SUMMARY", "HEALTH_PLAN", "MEDICATION"]);
const relationshipLabelOtherSchema = z.string().trim().min(1).max(CAREGIVER_RELATIONSHIP_LABEL_OTHER_MAX);
const scopeIdSchema = z.uuid().transform((id) => id.toLowerCase());

function refineLabel(
  input: { relationshipLabel?: string | undefined; relationshipLabelOther?: string | undefined },
  context: z.RefinementCtx,
): void {
  if ((input.relationshipLabel === "OTHER") !== (input.relationshipLabelOther !== undefined)) {
    context.addIssue({ code: "custom", path: ["relationshipLabelOther"], message: "A custom label is required only for OTHER" });
  }
}

function refineUnique(values: readonly string[], path: string, context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) context.addIssue({ code: "custom", path: [path], message: "Duplicate scope" });
}

/**
 * AF-5 one-step add: what the Patient asks the caregiver to accept. Stored as the invitation's `requestedScopes`
 * JSON and parsed again with this schema on acceptance, where every scope is re-authorized.
 */
export const caregiverInvitationRequestedScopesSchema = z
  .object({
    appointmentRelationshipIds: z.array(scopeIdSchema).max(50),
    resources: z.array(caregiverResourceSchema).max(3),
  })
  .strict()
  .superRefine((input, context) => {
    refineUnique(input.appointmentRelationshipIds, "appointmentRelationshipIds", context);
    refineUnique(input.resources, "resources", context);
  });

/** The label is optional here so callers predating AF-5 still work; the add-caregiver form always sends it. */
export const createCaregiverInvitationInputSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    relationshipLabel: caregiverRelationshipLabelSchema.optional(),
    relationshipLabelOther: relationshipLabelOtherSchema.optional(),
    appointmentRelationshipIds: z.array(scopeIdSchema).max(50).default([]),
    resources: z.array(caregiverResourceSchema).max(3).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    refineLabel(input, context);
    refineUnique(input.appointmentRelationshipIds, "appointmentRelationshipIds", context);
    refineUnique(input.resources, "resources", context);
  });

export const updateCaregiverRelationshipLabelInputSchema = z
  .object({
    relationshipId: scopeIdSchema,
    relationshipLabel: caregiverRelationshipLabelSchema,
    relationshipLabelOther: relationshipLabelOtherSchema.optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine(refineLabel);

export const proposeResourceGrantInputSchema = z
  .object({ caregiverRelationshipId: scopeIdSchema, resource: caregiverResourceSchema })
  .strict();
export const resourceGrantIdSchema = scopeIdSchema;

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
export type CaregiverInvitationRequestedScopes = z.infer<typeof caregiverInvitationRequestedScopesSchema>;
export type FamilyManagementCursor = z.infer<typeof familyManagementCursorSchema>;
