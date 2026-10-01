import { z } from "zod";

import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

export const caregiverInvitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const createCaregiverInvitationInputSchema = z
  .object({ nationalId: thaiNationalIdSchema })
  .strict();

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
