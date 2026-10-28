import { z } from "zod";

import { patientProgramIdSchema } from "@/modules/patient-program/schemas/patient-program-schemas";
import { serviceDateSchema } from "@/shared/time/service-date";

import { MAX_PROGRAM_ROUNDS, REVIEWABLE_TOOL_CODES } from "../domain/round-catalog";

export const ROUND_VITALS_STRUCTURAL_NUMBER_MAX = 1_000_000;
export const ROUND_PREFERRED_NAME_MAX_LENGTH = 100;
export const ROUND_OCCUPATION_MAX_LENGTH = 200;
export const ROUND_SKIP_NOTE_MAX_LENGTH = 500;

export const roundSubmissionNonceSchema = z.string().uuid();
// ADR-0022: any round 1-12; a write also needs the round opened (round-sequencing).
export const roundNumberSchema = z.number().int().min(1).max(MAX_PROGRAM_ROUNDS);
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

/** Trimmed optional text; blank becomes null. */
function optionalTrimmedText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .nullable()
    .optional()
    .transform((value) => value?.trim() || null);
}

const vitalsMeasurementFieldNames = [
  "weight",
  "heightCm",
  "waistCircumference",
  "systolicBloodPressure",
  "diastolicBloodPressure",
  "bloodSugar",
] as const;

/**
 * SR-D12: round 1 also captures the preferred name and, when still empty, the occupation of the
 * hospital profile. `profileVersion` is the optimistic concurrency token (null = no profile row yet).
 */
const roundProfileFieldsSchema = z.object({
  preferredName: optionalTrimmedText(ROUND_PREFERRED_NAME_MAX_LENGTH),
  occupation: optionalTrimmedText(ROUND_OCCUPATION_MAX_LENGTH),
  profileVersion: z.number().int().positive().nullable().optional(),
});

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
  .merge(roundProfileFieldsSchema)
  .strict()
  .superRefine((input, context) => {
    if (!vitalsMeasurementFieldNames.some((fieldName) => input[fieldName] != null)) {
      context.addIssue({
        code: "custom",
        message: "At least one round vitals measurement is required",
        path: ["weight"],
      });
    }

    if (input.roundNumber !== 1 && (input.preferredName || input.occupation)) {
      context.addIssue({
        code: "custom",
        message: "Profile fields are captured in round 1 only",
        path: ["preferredName"],
      });
    }
  });

export type RoundVitalsRequest = z.output<typeof roundVitalsRequestSchema>;

/** The "รู้จักตัวฉันเอง" step of round 1. */
export const roundProfileRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: z.literal(1),
  })
  .merge(roundProfileFieldsSchema)
  .strict()
  .superRefine((input, context) => {
    if (!input.preferredName) {
      context.addIssue({ code: "custom", message: "The preferred name is required", path: ["preferredName"] });
    }
  });

export type RoundProfileRequest = z.output<typeof roundProfileRequestSchema>;

export const roundReviewToolCodeSchema = z.enum(REVIEWABLE_TOOL_CODES);

export const roundReviewRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: roundNumberSchema,
    toolCode: roundReviewToolCodeSchema,
    submissionNonce: roundSubmissionNonceSchema,
  })
  .strict();

export type RoundReviewRequest = z.output<typeof roundReviewRequestSchema>;

export const roundStepCodeSchema = z.enum([
  "VITALS",
  "KNOW_SELF",
  "PAM",
  "PROMS",
  "FLOATING_CHART",
  "CONFIDENCE_RULER",
  "ROUTINE",
  "HEALTH_PATH",
  "HEALTH_PLAN_REVIEW",
  "DREAM_CARD",
  "HEALTHY_PLAN",
  "HEALTH_PATH_REVIEW",
]);

export const roundSkipReasonSchema = z.enum([
  "PATIENT_DECLINED",
  "PATIENT_UNABLE",
  "EQUIPMENT_UNAVAILABLE",
  "OTHER",
]);

/** SR-D3: a reason is required; OTHER also needs a note (≤ 500 characters). */
export const roundStepSkipRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: roundNumberSchema,
    stepCode: roundStepCodeSchema,
    reasonCode: roundSkipReasonSchema,
    note: optionalTrimmedText(ROUND_SKIP_NOTE_MAX_LENGTH),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.reasonCode === "OTHER" && !input.note) {
      context.addIssue({ code: "custom", message: "A note is required for OTHER", path: ["note"] });
    }
  });

export type RoundStepSkipRequest = z.output<typeof roundStepSkipRequestSchema>;

export const roundStepUnskipRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: roundNumberSchema,
    stepCode: roundStepCodeSchema,
  })
  .strict();

export type RoundStepUnskipRequest = z.output<typeof roundStepUnskipRequestSchema>;

export const roundCompletionRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: roundNumberSchema,
    submissionNonce: roundSubmissionNonceSchema,
  })
  .strict();

export type RoundCompletionRequest = z.output<typeof roundCompletionRequestSchema>;

export const roundSchemaInternals = { vitalsMeasurementFieldNames };
