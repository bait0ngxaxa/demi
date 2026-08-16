import { z } from "zod";

export const PATIENT_DIRECTORY_PAGE_SIZE = 25;
export const PATIENT_DIRECTORY_MAX_PAGE = 1_000;
export const PATIENT_DIRECTORY_NAME_MAX_LENGTH = 120;
export const PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH = 64;

export const patientDirectoryLookupTypeSchema = z.enum(["NAME", "HOSPITAL_NUMBER"]);

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
    value: optionalLookupValueSchema,
    page: z.coerce.number().int().min(1).max(PATIENT_DIRECTORY_MAX_PAGE),
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
        message: "Hospital number is too long",
      });
    }
  });

export const patientDirectoryRelationshipIdSchema = z.uuid();

export type PatientDirectoryLookupType = z.infer<typeof patientDirectoryLookupTypeSchema>;
export type PatientDirectoryQueryInput = z.infer<typeof patientDirectoryQuerySchema>;
