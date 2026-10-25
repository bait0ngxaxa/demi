import { z } from "zod";
import { selfRegistrationListFilterSchema } from "@/modules/self-registration/domain/self-registration-schemas";

export const PATIENT_DIRECTORY_PAGE_SIZE = 25;
export const PATIENT_DIRECTORY_NAME_MAX_LENGTH = 120;
export const PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH = 64;

export const patientDirectoryLookupTypeSchema = z.enum(["NAME", "HOSPITAL_NUMBER"]);
export const patientDirectoryClassificationFilterSchema = z.enum(["ALL", "RISK", "DIABETES"]);

const optionalLookupValueSchema = z.preprocess(
  (value: unknown) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized || undefined;
  },
  z.string().max(PATIENT_DIRECTORY_NAME_MAX_LENGTH).optional(),
);

export const patientDirectoryQuerySchema = z
  .object({
    targetHospitalId: z.uuid(),
    lookupType: patientDirectoryLookupTypeSchema,
    classification: patientDirectoryClassificationFilterSchema.optional(),
    selfRegistration: selfRegistrationListFilterSchema.optional(),
    value: optionalLookupValueSchema,
    page: z.coerce
      .number()
      .int()
      .min(1)
      .refine(Number.isSafeInteger, "Page must be a safe integer"),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.lookupType === "HOSPITAL_NUMBER" &&
      input.value !== undefined &&
      input.value.length > PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH
    ) {
      context.addIssue({
        code: "too_big",
        maximum: PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH,
        origin: "string",
        inclusive: true,
        path: ["value"],
        message: "HN ยาวเกินจำนวนที่รองรับ",
      });
    }
  });

export const patientAssignedDirectoryQuerySchema = z
  .object({
    /** Optional Hospital locator; it only narrows the assignment predicate and never widens it. */
    hospitalId: z.uuid().transform((value) => value.toLowerCase()).optional(),
    lookupType: patientDirectoryLookupTypeSchema,
    classification: patientDirectoryClassificationFilterSchema.optional(),
    value: optionalLookupValueSchema,
    page: z.coerce
      .number()
      .int()
      .min(1)
      .refine(Number.isSafeInteger, "Page must be a safe integer"),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.lookupType === "HOSPITAL_NUMBER" &&
      input.value !== undefined &&
      input.value.length > PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH
    ) {
      context.addIssue({
        code: "too_big",
        maximum: PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH,
        origin: "string",
        inclusive: true,
        path: ["value"],
        message: "HN ยาวเกินจำนวนที่รองรับ",
      });
    }
  });

export const workforceOsmPatientListQuerySchema = z
  .object({
    hospitalId: z.uuid(),
    osmUserId: z.uuid(),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .refine(Number.isSafeInteger, "Page must be a safe integer"),
  })
  .strict();

export const patientDirectoryRelationshipIdSchema = z.uuid();

export type PatientDirectoryLookupType = z.infer<typeof patientDirectoryLookupTypeSchema>;
export type PatientDirectoryClassificationFilter = z.infer<
  typeof patientDirectoryClassificationFilterSchema
>;
export type PatientDirectorySelfRegistrationFilter = z.infer<typeof selfRegistrationListFilterSchema>;
export type PatientDirectoryQueryInput = z.infer<typeof patientDirectoryQuerySchema>;
export type PatientAssignedDirectoryQueryInput = z.infer<typeof patientAssignedDirectoryQuerySchema>;
export type WorkforceOsmPatientListQueryInput = z.infer<typeof workforceOsmPatientListQuerySchema>;
