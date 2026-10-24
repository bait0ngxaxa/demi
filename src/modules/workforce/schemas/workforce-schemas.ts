import { Profession } from "@prisma/client";
import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";
import { selfRegistrationListFilterSchema } from "@/modules/self-registration/domain/self-registration-schemas";

// Validate raw characters before removing separators (hospital-contact guard style).
// An ASCII allowlist also rejects controls, invisible characters and unpaired surrogates.
export const workforceContactPhoneSchema = z.string({ error: "กรุณากรอกเบอร์ติดต่อ" })
  .max(32, "เบอร์ติดต่อยาวเกินกำหนด")
  .regex(/^[0-9 -]+$/u, "เบอร์ติดต่อใช้ได้เฉพาะตัวเลข เว้นวรรค และขีด")
  .transform((value) => value.replace(/[ -]/gu, ""))
  .pipe(z.string().regex(/^(?:0[689][0-9]{8}|0[0-9]{8})$/u, "กรุณากรอกเบอร์มือถือไทย 10 หลัก หรือเบอร์โทรศัพท์พื้นฐาน 9 หลัก"));

export const personNameSchema = z.string().trim().min(1).max(120);

export const workforceKindSchema = z.enum(["HOSPITAL_MEMBER", "OSM"]);
export const workforceDetailKindSchema = z.enum(["staff", "osm"]);
export const workforceActivationModeSchema = z.enum(["REMOTE", "ASSISTED"]);
export const workforceTargetHospitalIdSchema = z.uuid();
export const workforceRelationshipIdSchema = z.uuid();
export const workforceExpectedUpdatedAtSchema = z.iso.datetime({ offset: true });

export const hospitalMemberProvisionSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    contactPhone: workforceContactPhoneSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    targetHospitalId: workforceTargetHospitalIdSchema,
    profession: z.nativeEnum(Profession),
  })
  .strict();

export const osmProvisionSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    contactPhone: workforceContactPhoneSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    targetHospitalId: workforceTargetHospitalIdSchema,
  })
  .strict();

export const workforceListSchema = z
  .object({
    targetHospitalId: workforceTargetHospitalIdSchema,
    staffCursor: z.string().max(2048).optional(),
    osmCursor: z.string().max(2048).optional(),
    search: z.string().trim().max(120).optional(),
    status: z.enum(["PROVISIONED", "INVITED", "ACTIVE", "SUSPENDED", "ENDED"]).optional(),
    selfRegistration: selfRegistrationListFilterSchema.optional(),
    pageSize: z.number().int().min(1).max(50).optional(),
  })
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

export const workforceContactPhoneUpdateSchema = z.object({
  ...hospitalMembershipLifecycleFields,
  kind: workforceDetailKindSchema,
  contactPhone: workforceContactPhoneSchema,
}).strict();

export const hospitalMembershipProfessionUpdateSchema = z
  .object({
    ...hospitalMembershipLifecycleFields,
    profession: z.nativeEnum(Profession),
  })
  .strict();

export const hospitalMembershipTransitionSchema = z
  .object(hospitalMembershipLifecycleFields)
  .strict();

export const hospitalMembershipReportExportGrantSchema = z
  .object({
    ...hospitalMembershipLifecycleFields,
    granted: z.boolean(),
  })
  .strict();

export const hospitalOwnerGovernanceMutationSchema = z
  .object({
    relationshipId: workforceRelationshipIdSchema,
    targetHospitalId: workforceTargetHospitalIdSchema,
    expectedUpdatedAt: workforceExpectedUpdatedAtSchema,
  })
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
    nationalId: thaiNationalIdSchema,
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

export const workforceActivationTokenSchema = z.string().trim().min(1).max(256);

export const WORKFORCE_BULK_MAX_ROWS = 50;
export const WORKFORCE_SLIP_MAX_PEOPLE = 50;

export const workforcePasswordResetRequestSchema = z
  .object({
    userId: z.uuid(),
    targetHospitalId: workforceTargetHospitalIdSchema,
  })
  .strict();

// Rows are validated one by one so a single invalid row never blocks the others.
export const workforceBulkProvisionSchema = z
  .object({
    // The timestamp is part of the key: expired keys stay unusable even after receipt pruning.
    submissionId: z.string().regex(/^\d{13}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
    targetHospitalId: workforceTargetHospitalIdSchema,
    kind: workforceKindSchema,
    rows: z.array(z.unknown()).min(1).max(WORKFORCE_BULK_MAX_ROWS),
    rowNumbers: z.array(z.number().int().min(1).max(WORKFORCE_BULK_MAX_ROWS)).max(WORKFORCE_BULK_MAX_ROWS).optional(),
  })
  .strict()
  .refine(({ rows, rowNumbers }) => !rowNumbers || (rowNumbers.length === rows.length &&
    rowNumbers.every((row, index) => index === 0 || row > rowNumbers[index - 1])));

export const workforceActivationSlipRequestSchema = z
  .object({
    targetHospitalId: workforceTargetHospitalIdSchema,
    kind: workforceKindSchema,
    userIds: z.array(z.uuid()).min(1).max(WORKFORCE_SLIP_MAX_PEOPLE),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.userIds).size !== input.userIds.length) {
      context.addIssue({ code: "custom", path: ["userIds"], message: "Duplicate user selection" });
    }
  });

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
export type HospitalMembershipReportExportGrantInput = z.infer<
  typeof hospitalMembershipReportExportGrantSchema
>;
export type HospitalOwnerGovernanceMutationInput = z.infer<
  typeof hospitalOwnerGovernanceMutationSchema
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
export type WorkforcePasswordResetRequestInput = z.infer<typeof workforcePasswordResetRequestSchema>;
export type WorkforceBulkProvisionInput = z.infer<typeof workforceBulkProvisionSchema>;
export type WorkforceActivationSlipRequestInput = z.infer<
  typeof workforceActivationSlipRequestSchema
>;
export type WorkforceKind = z.infer<typeof workforceKindSchema>;
export type WorkforceActivationMode = z.infer<typeof workforceActivationModeSchema>;
export type WorkforceDetailKind = z.infer<typeof workforceDetailKindSchema>;

export const workforceReleaseSchema = z.object({
  relationshipId: workforceRelationshipIdSchema,
  targetHospitalId: workforceTargetHospitalIdSchema,
  expectedUpdatedAt: workforceExpectedUpdatedAtSchema,
  kind: workforceDetailKindSchema,
  confirmation: z.literal("นำออกจากระบบ"),
}).strict();
