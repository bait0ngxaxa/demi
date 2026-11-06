import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";
import { legalAcceptanceInputSchema, legalChannelSchema } from "@/modules/legal/schemas/legal-schemas";

export const SELF_REGISTRATION_ELIGIBILITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const SELF_REGISTRATION_CAPABILITY_TTL_MS = 10 * 60 * 1000;
export const selfRegistrationListFilterSchema = z.enum(["ALL", "SELF_REGISTERED"]);

export const selfRegistrationRelationshipSchema = z.object({
  kind: z.enum(["HOSPITAL_MEMBER", "OSM", "PATIENT"]),
  id: z.uuid(),
  hospitalId: z.uuid(),
}).strict();

export const selfRegistrationRelationshipsSchema = z.array(selfRegistrationRelationshipSchema).min(1);

export const selfRegistrationLookupSchema = z.object({
  nationalId: thaiNationalIdSchema,
}).strict();

export const selfRegistrationCompletionSchema = z.object({
  token: z.string().trim().min(1).max(256),
  nationalId: thaiNationalIdSchema,
  password: userOwnedPasswordSchema,
  passwordConfirmation: userOwnedPasswordSchema,
  nameConfirmed: z.boolean(),
  /** LG-D4: required Terms + Privacy acceptance. ADR-0028: /register offers no consents. */
  acceptLegal: legalAcceptanceInputSchema,
  /** Set by the route handler from the request, never taken from the client body. */
  channel: legalChannelSchema,
}).strict().refine((input) => input.password === input.passwordConfirmation, {
  path: ["passwordConfirmation"],
});

export type SelfRegistrationRelationship = z.infer<typeof selfRegistrationRelationshipSchema>;
export type SelfRegistrationListFilter = z.infer<typeof selfRegistrationListFilterSchema>;
export type SelfRegistrationOutcome =
  | { outcome: "FOUND"; capability: string; maskedName: string }
  | { outcome: "NOT_FOUND"; message: string }
  | { outcome: "ALREADY_ACTIVE"; message: string }
  | { outcome: "RETRY"; message: string };
