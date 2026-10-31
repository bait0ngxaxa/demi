import { z } from "zod";

import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";
import { personNameSchema, workforceActivationModeSchema } from "@/modules/workforce/schemas/workforce-schemas";

// ADR-0024: platform ADMIN Parent OWNER invitation; the same invitee fields and delivery as a Child OWNER invitation.
const hospitalIdSchema = z.uuid().transform((value) => value.toLowerCase());

export const parentOwnerInvitationTargetSchema = z.object({ hospitalId: hospitalIdSchema }).strict();
export const parentOwnerHospitalIdListSchema = hospitalIdSchema.array().max(200);
export const parentOwnerLinkIssueSchema = parentOwnerInvitationTargetSchema.extend({ mode: workforceActivationModeSchema });
export const parentOwnerInviteeSchema = parentOwnerInvitationTargetSchema.extend({
  nationalId: thaiNationalIdSchema,
  givenName: personNameSchema,
  familyName: personNameSchema,
  mode: workforceActivationModeSchema,
  submissionNonce: z.uuid(),
});

export type ParentOwnerInviteeInput = z.infer<typeof parentOwnerInviteeSchema>;
export const parentOwnerInvitationCancelSchema = parentOwnerInvitationTargetSchema.extend({ membershipId: hospitalIdSchema });
