import { z } from "zod";

import { patientProgramIdSchema } from "@/modules/patient-program/schemas/patient-program-schemas";
import { serviceDateSchema } from "@/shared/time/service-date";

import { REVIEWABLE_TOOL_CODES } from "../domain/round-catalog";

export const ROUND_VITALS_STRUCTURAL_NUMBER_MAX = 1_000_000;

export const roundSubmissionNonceSchema = z.string().uuid();
export const roundNumberSchema = z.number().int().min(1).max(6);
export const roundVitalsRoundNumberSchema = z.number().int().min(1).max(2);

const positiveMeasurementSchema = z
  .number()
  .finite()
  .positive()
  .max(ROUND_VITALS_STRUCTURAL_NUMBER_MAX)
  .nullable()
  .optional();

const bloodSugarSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(ROUND_VITALS_STRUCTURAL_NUMBER_MAX)
  .nullable()
  .optional();

const vitalsMeasurementFieldNames = [
  "weight",
  "heightCm",
  "waistCircumference",
  "systolicBloodPressure",
  "diastolicBloodPressure",
  "bloodSugar",
] as const;

export const roundVitalsRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: roundVitalsRoundNumberSchema,
    submissionNonce: roundSubmissionNonceSchema,
    serviceDate: serviceDateSchema,
    weight: positiveMeasurementSchema,
    heightCm: positiveMeasurementSchema,
    waistCircumference: positiveMeasurementSchema,
    systolicBloodPressure: positiveMeasurementSchema,
    diastolicBloodPressure: positiveMeasurementSchema,
    bloodSugar: bloodSugarSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (!vitalsMeasurementFieldNames.some((fieldName) => input[fieldName] != null)) {
      context.addIssue({
        code: "custom",
        message: "At least one round vitals measurement is required",
        path: ["weight"],
      });
    }
  });

export type RoundVitalsRequest = z.output<typeof roundVitalsRequestSchema>;

export const roundReviewToolCodeSchema = z.enum(
  REVIEWABLE_TOOL_CODES as unknown as [
    (typeof REVIEWABLE_TOOL_CODES)[number],
    ...(typeof REVIEWABLE_TOOL_CODES)[number][],
  ],
);

export const roundReviewRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: roundNumberSchema,
    toolCode: roundReviewToolCodeSchema,
    submissionNonce: roundSubmissionNonceSchema,
  })
  .strict();

export type RoundReviewRequest = z.output<typeof roundReviewRequestSchema>;

export const roundSchemaInternals = { vitalsMeasurementFieldNames };
