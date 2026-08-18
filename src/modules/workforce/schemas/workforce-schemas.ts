import { Profession } from "@prisma/client";
import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

const personNameSchema = z.string().trim().min(1).max(120);

export const workforceKindSchema = z.enum(["HOSPITAL_MEMBER", "OSM"]);
export const workforceDetailKindSchema = z.enum(["staff", "osm"]);
export const workforceActivationModeSchema = z.enum(["REMOTE", "ASSISTED"]);
export const workforceTargetHospitalIdSchema = z.uuid();
export const workforceRelationshipIdSchema = z.uuid();
export const workforceExpectedUpdatedAtSchema = z.iso.datetime({ offset: true });

export const hospitalMemberProvisionSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    targetHospitalId: workforceTargetHospitalIdSchema,
    profession: z.nativeEnum(Profession),
  })
  .strict();

export const osmProvisionSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    targetHospitalId: workforceTargetHospitalIdSchema,
  })
  .strict();

export const workforceListSchema = z
  .object({ targetHospitalId: workforceTargetHospitalIdSchema })
  .strict();

export const workforceDetailRequestSchema = z
  .object({
    kind: workforceDetailKindSchema,
    relationshipId: workforceRelationshipIdSchema,
  })
  .strict();

const hospitalMembershipLifecycleFields = {
  relationshipId: workforceRelationshipIdSchema,
  targetHospitalId: workforceTargetHospitalIdSchema,
  expectedUpdatedAt: workforceExpectedUpdatedAtSchema,
} as const;

export const hospitalMembershipProfessionUpdateSchema = z
  .object({
    ...hospitalMembershipLifecycleFields,
    profession: z.nativeEnum(Profession),
  })
  .strict();

export const hospitalMembershipTransitionSchema = z
  .object(hospitalMembershipLifecycleFields)
  .strict();

const osmRelationshipLifecycleFields = {
  relationshipId: workforceRelationshipIdSchema,
  targetHospitalId: workforceTargetHospitalIdSchema,
  expectedUpdatedAt: workforceExpectedUpdatedAtSchema,
} as const;

export const osmRelationshipTransitionSchema = z
  .object(osmRelationshipLifecycleFields)
  .strict();

export const workforceActivationRequestSchema = z
  .object({
    userId: z.uuid(),
    targetHospitalId: workforceTargetHospitalIdSchema,
    kind: workforceKindSchema,
    mode: workforceActivationModeSchema,
  })
  .strict();

export const workforceActivationCompletionSchema = z
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

export const workforceActivationTokenSchema = z.string().trim().min(1).max(256);

export type HospitalMemberProvisionInput = z.infer<typeof hospitalMemberProvisionSchema>;
export type OsmProvisionInput = z.infer<typeof osmProvisionSchema>;
export type WorkforceListInput = z.infer<typeof workforceListSchema>;
export type WorkforceDetailRequest = z.infer<typeof workforceDetailRequestSchema>;
export type HospitalMembershipProfessionUpdateInput = z.infer<
  typeof hospitalMembershipProfessionUpdateSchema
>;
export type HospitalMembershipTransitionInput = z.infer<
  typeof hospitalMembershipTransitionSchema
>;
export type OsmRelationshipTransitionInput = z.infer<
  typeof osmRelationshipTransitionSchema
>;
export type WorkforceActivationRequestInput = z.infer<
  typeof workforceActivationRequestSchema
>;
export type WorkforceActivationCompletionInput = z.infer<
  typeof workforceActivationCompletionSchema
>;
export type WorkforceKind = z.infer<typeof workforceKindSchema>;
export type WorkforceActivationMode = z.infer<typeof workforceActivationModeSchema>;
export type WorkforceDetailKind = z.infer<typeof workforceDetailKindSchema>;
