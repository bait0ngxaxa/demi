import { z } from "zod";

import { hospitalNameSchema, optionalHospitalCodeSchema } from "@/modules/hospital-governance/schemas/hospital-governance-schemas";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";
import { personNameSchema, workforceActivationModeSchema } from "@/modules/workforce/schemas/workforce-schemas";

const id = z.string().uuid().transform((value) => value.toLowerCase());
const reason = z.string().trim().min(1).max(500);
const pagination = { afterId: id.optional(), limit: z.number().int().min(1).max(100).default(50) };
export const serviceAreaParentSchema = z.object({ parentHospitalId: id }).strict();
export const serviceAreaAttachSchema = serviceAreaParentSchema.extend({ childHospitalId: id });
export const serviceAreaEndSchema = serviceAreaParentSchema.extend({
  areaId: id,
  confirm: z.literal(true),
  endReason: reason,
});
export const serviceAreaPageSchema = serviceAreaParentSchema.extend(pagination);
export const serviceAreaCandidatePageSchema = serviceAreaPageSchema.extend({
  query: z.string().trim().max(100).optional(),
});

// Parent OWNER Child facility onboarding (ADR-0018).
const childOwnerInvitee = {
  nationalId: thaiNationalIdSchema,
  givenName: personNameSchema,
  familyName: personNameSchema,
  mode: workforceActivationModeSchema,
};
export const childFacilityCreateSchema = serviceAreaParentSchema.extend({
  name: hospitalNameSchema,
  hospitalCode: optionalHospitalCodeSchema,
  ...childOwnerInvitee,
  // Rendered per request; a replay returns the Child it already created.
  submissionNonce: z.uuid(),
});
export const childFacilityTargetSchema = serviceAreaParentSchema.extend({ childHospitalId: id });
export const childOwnerLinkIssueSchema = childFacilityTargetSchema.extend({ mode: workforceActivationModeSchema });
export const childOwnerInviteeSchema = childFacilityTargetSchema.extend(childOwnerInvitee);
export const childFacilityCancelSchema = childFacilityTargetSchema.extend({ confirm: z.literal(true), reason });
export const childFacilityRenameSchema = childFacilityTargetSchema.extend({
  name: hospitalNameSchema,
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});
export const childOwnerInvitationResponseSchema = z.object({ membershipId: id }).strict();

// Platform ADMIN network governance (ADR-0015).
export const networkRoleSetSchema = z.object({
  hospitalId: id,
  kind: z.enum(["PARENT", "CHILD"]),
}).strict();
export const governedHospitalIdSchema = id;
export const networkRoleClearSchema = z.object({ hospitalId: id, confirm: z.literal(true) }).strict();
export const governedAreaPageSchema = serviceAreaPageSchema;
export const governedAreaEndSchema = z.object({ areaId: id, confirm: z.literal(true), endReason: reason }).strict();
export const governedAreaTransferSchema = z.object({
  areaId: id,
  toParentHospitalId: id,
  confirm: z.literal(true),
  reason,
}).strict();
