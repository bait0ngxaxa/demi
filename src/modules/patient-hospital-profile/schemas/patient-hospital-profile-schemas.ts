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

// Hospital staff own only the hospital-local contact fields, never Person identity.
export const staffPatientHospitalProfileUpdateSchema = z.object({
  expectedVersion: expectedVersionSchema,
  phoneNumber: optionalProfileValue(32),
  addressText: optionalProfileValue(2000),
  houseNumber: optionalProfileValue(200),
  villageNumber: optionalProfileValue(200),
  villageName: optionalProfileValue(200),
  soi: optionalProfileValue(200),
  road: optionalProfileValue(200),
  province: optionalProfileValue(200),
  district: optionalProfileValue(200),
  subdistrict: optionalProfileValue(200),
  postalCode: z.union([z.string().regex(/^\d{5}$/u), z.literal("").transform(() => null), z.null()]).optional(),
  emergencyContactName: optionalProfileValue(200),
  emergencyContactPhone: optionalProfileValue(32),
  emergencyContactRelationship: optionalProfileValue(200),
  occupation: optionalProfileValue(200),
  educationLevel: optionalProfileValue(200),
}).strict();

const personNameSchema = z.string().trim().min(1).max(120);

/** Customer decision E3 (ก-19): Person name correction with Person.version optimistic concurrency. */
export const patientNameCorrectionSchema = z
  .object({
    expectedVersion: expectedVersionSchema.pipe(z.number().int().min(1)),
    givenName: personNameSchema,
    familyName: personNameSchema,
  })
  .strict();

export const patientNameCorrectionLookupSchema = z
  .object({
    hospitalId: z.string().uuid(),
    hospitalNumber: z.string().trim().min(1).max(64),
  })
  .strict();
