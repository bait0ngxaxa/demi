import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

export const patientActivationTokenSchema = z.string().trim().min(1).max(256);
export const PATIENT_ACTIVATION_NAME_MAX_LENGTH = 120;
export const PATIENT_ACTIVATION_HOSPITAL_NUMBER_MAX_LENGTH = 64;

export const patientActivationRequestSchema = z
  .object({
    userId: z.uuid(),
    targetHospitalId: z.uuid(),
    reissue: z.boolean(),
  })
  .strict();

export const patientActivationLookupTypeSchema = z.enum([
  "NAME",
  "NATIONAL_ID",
  "HOSPITAL_NUMBER",
]);

export const patientActivationLookupSchema = z
  .object({
    targetHospitalId: z.uuid(),
    lookupType: patientActivationLookupTypeSchema,
    value: z.string().trim().min(1).max(PATIENT_ACTIVATION_NAME_MAX_LENGTH),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.lookupType === "HOSPITAL_NUMBER" &&
      input.value.length > PATIENT_ACTIVATION_HOSPITAL_NUMBER_MAX_LENGTH
    ) {
      context.addIssue({
        code: "too_big",
        maximum: PATIENT_ACTIVATION_HOSPITAL_NUMBER_MAX_LENGTH,
        origin: "string",
        inclusive: true,
        path: ["value"],
        message: "HN ยาวเกินจำนวนที่รองรับ",
      });
    }

    if (input.lookupType === "NATIONAL_ID" && !thaiNationalIdSchema.safeParse(input.value).success) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "เลขบัตรประชาชนไม่ถูกต้อง",
      });
    }
  });

export const patientActivationCompletionSchema = z
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
        message: "รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน",
      });
    }
  });

export type PatientActivationRequestInput = z.infer<typeof patientActivationRequestSchema>;
export type PatientActivationLookupInput = z.infer<typeof patientActivationLookupSchema>;
export type PatientActivationCompletionInput = z.infer<
  typeof patientActivationCompletionSchema
>;
