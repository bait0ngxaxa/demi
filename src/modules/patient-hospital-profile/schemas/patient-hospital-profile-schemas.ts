import { z } from "zod";

import {
  PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS,
  PATIENT_HOSPITAL_PROFILE_FIELDS,
} from "../domain/patient-hospital-profile-values";

const expectedVersionSchema = z.union([
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  z
    .string()
    .regex(/^\d{1,16}$/u)
    .transform(Number)
    .pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)),
]);

function optionalProfileValue(maximum: number): z.ZodType<string | null | undefined> {
  return z
    .union([z.string().trim().max(maximum).transform((value) => value || null), z.null()])
    .optional();
}

export const patientHospitalProfileUpdateSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    gender: optionalProfileValue(PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.gender),
    phoneNumber: optionalProfileValue(PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.phoneNumber),
    addressText: optionalProfileValue(PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.addressText),
    emergencyContactName: optionalProfileValue(
      PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.emergencyContactName,
    ),
    emergencyContactPhone: optionalProfileValue(
      PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.emergencyContactPhone,
    ),
    occupation: optionalProfileValue(PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.occupation),
    educationLevel: optionalProfileValue(
      PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.educationLevel,
    ),
  })
  .strict()
  .superRefine((input, context) => {
    const hasProfileValue = PATIENT_HOSPITAL_PROFILE_FIELDS.some(
      (field) => input[field] !== undefined,
    );

    if (!hasProfileValue) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "At least one approved profile value is required",
      });
    }
  });

export const patientHospitalProfileRelationshipIdSchema = z.uuid();

export type PatientHospitalProfileUpdateInput = z.infer<
  typeof patientHospitalProfileUpdateSchema
>;
