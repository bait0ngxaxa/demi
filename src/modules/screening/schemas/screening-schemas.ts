import { z } from "zod";

export const SCREENING_CONFIDENCE_PLAN_MAX_LENGTH = 1_000;

export const screeningRelationshipIdSchema = z.string().uuid();
export const screeningIdSchema = z.string().uuid();
export const screeningSubmissionNonceSchema = z.string().uuid();

export const screeningResponsesSchema = z
  .object({
    pam: z.record(z.string().trim().min(1), z.number().int()),
    proms: z.record(z.string().trim().min(1), z.number().int()),
    confidenceScore: z.number().int().min(0).max(10),
    confidenceImprovementPlan: z
      .string()
      .max(SCREENING_CONFIDENCE_PLAN_MAX_LENGTH)
      .nullable()
      .optional()
      .transform((value) => value?.trim() || null),
  })
  .strict();

export type ScreeningResponses = z.infer<typeof screeningResponsesSchema>;

export const screeningResultSchema = z
  .object({
    pamTotal: z.number().int().min(0).max(20),
    promsTotal: z.number().int().min(0).max(24),
    promsMin: z.number().int().min(1).max(6),
    combinedTotal: z.number().int().min(0).max(44),
    percentage: z.number().min(0).max((44 / 44) * 100).nullable(),
    level: z.enum(["L1", "L2", "L3", "L4"]),
    zone: z.enum(["RED", "YELLOW", "GREEN"]),
  })
  .strict();

export type ScreeningResult = z.infer<typeof screeningResultSchema>;

export const screeningSubmitRequestSchema = z
  .object({
    patientHospitalRelationshipId: screeningRelationshipIdSchema,
    submissionNonce: screeningSubmissionNonceSchema,
    responses: screeningResponsesSchema,
  })
  .strict();

export type ScreeningSubmitRequest = z.output<typeof screeningSubmitRequestSchema>;

export type NormalizedScreeningSubmitRequest = z.output<typeof screeningSubmitRequestSchema>;
