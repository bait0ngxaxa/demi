import { z } from "zod";

import { patientProgramIdSchema } from "./patient-program-schemas";

export const PATIENT_PROGRAM_SERVICE_ONE_TEXT_MAX_LENGTH = 2_000;

const optionalTextSchema = z
  .string()
  .trim()
  .max(PATIENT_PROGRAM_SERVICE_ONE_TEXT_MAX_LENGTH)
  .nullable()
  .optional()
  .transform((value) => value?.trim() || null);

const confidenceScoreSchema = z.number().int().min(0).max(10);

export const patientProgramServiceOneRoutineRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
  })
  .strict();

export const patientProgramServiceOneFloatingChartRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    summary: optionalTextSchema,
  })
  .strict();

export const patientProgramServiceOneDreamCardRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    description: optionalTextSchema,
  })
  .strict();

export const patientProgramServiceOneConfidenceRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    score: confidenceScoreSchema,
    improvementPlan: optionalTextSchema,
  })
  .strict();

export type PatientProgramServiceOneRoutineRequest = z.output<
  typeof patientProgramServiceOneRoutineRequestSchema
>;
export type PatientProgramServiceOneFloatingChartRequest = z.output<
  typeof patientProgramServiceOneFloatingChartRequestSchema
>;
export type PatientProgramServiceOneDreamCardRequest = z.output<
  typeof patientProgramServiceOneDreamCardRequestSchema
>;
export type PatientProgramServiceOneConfidenceRequest = z.output<
  typeof patientProgramServiceOneConfidenceRequestSchema
>;

export const patientProgramServiceOneSchemaInternals = {
  confidenceScoreSchema,
  optionalTextSchema,
};
