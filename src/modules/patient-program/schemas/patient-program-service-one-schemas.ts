import { z } from "zod";

import { patientEvidenceArtifactIdSchema } from "@/modules/patient-evidence/schemas/patient-evidence-schemas";

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

export const patientProgramServiceOneActivitySchema = z.enum([
  "ROUTINE",
  "FLOATING_CHART",
  "DREAM_CARD",
  "CONFIDENCE",
]);

export const patientProgramServiceOneArtifactActivitySchema =
  patientProgramServiceOneActivitySchema.extract(["ROUTINE", "FLOATING_CHART", "DREAM_CARD"]);

export type PatientProgramServiceOneActivity = z.output<
  typeof patientProgramServiceOneActivitySchema
>;
export type PatientProgramServiceOneArtifactActivity = z.output<
  typeof patientProgramServiceOneArtifactActivitySchema
>;

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

export const patientProgramServiceOneArtifactAssociationRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    patientEvidenceArtifactId: patientEvidenceArtifactIdSchema,
    activity: patientProgramServiceOneArtifactActivitySchema,
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
export type PatientProgramServiceOneArtifactAssociationRequest = z.output<
  typeof patientProgramServiceOneArtifactAssociationRequestSchema
>;

export const patientProgramServiceOneSchemaInternals = {
  confidenceScoreSchema,
  optionalTextSchema,
};
