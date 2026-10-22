import { z } from "zod";

export const SCREENING_CONFIDENCE_PLAN_MAX_LENGTH = 1_000;

export const screeningRelationshipIdSchema = z.string().uuid();
export const screeningIdSchema = z.string().uuid();
export const screeningSubmissionNonceSchema = z.string().uuid();
export const screeningInstrumentSchema = z.enum(["PAM", "PROMS"]);

/** Legacy combined PAM+PROMs responses (legacy-prototype-v1); read only. */
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

/** Legacy combined result (legacy-prototype-v1); read only. */
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

/** R2-C: one instrument's answers, keyed by question key. */
export const instrumentResponsesSchema = z
  .object({
    answers: z.record(z.string().trim().min(1), z.number().int()),
  })
  .strict();

export type InstrumentResponses = z.infer<typeof instrumentResponsesSchema>;

export const pamResultSchema = z
  .object({
    total: z.number().int().min(5).max(20),
    group: z.enum(["SUPPORT", "GENERAL", "INTENSIVE", "CHAMPION"]),
  })
  .strict();

export const promsResultSchema = z
  .object({
    itemScores: z.record(z.string().min(1), z.number().int().min(1).max(5)),
    hasProblem: z.boolean(),
    problemItemKeys: z.array(z.string().min(1)),
  })
  .strict();

export const screeningSubmitRequestSchema = z
  .object({
    patientHospitalRelationshipId: screeningRelationshipIdSchema,
    // Set when the screening is performed from round 1 of a Program (WB-DF-01).
    patientProgramId: z.string().uuid().optional(),
    submissionNonce: screeningSubmissionNonceSchema,
    instrument: screeningInstrumentSchema,
    responses: instrumentResponsesSchema,
  })
  .strict();

export type ScreeningSubmitRequest = z.output<typeof screeningSubmitRequestSchema>;
