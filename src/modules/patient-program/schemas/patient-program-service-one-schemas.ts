import { z } from "zod";

import { patientEvidenceArtifactIdSchema } from "@/modules/patient-evidence/schemas/patient-evidence-schemas";
import { serviceDateSchema } from "@/shared/time/service-date";

import { patientProgramIdSchema } from "./patient-program-schemas";

export const PATIENT_PROGRAM_SERVICE_ONE_TEXT_MAX_LENGTH = 2_000;
export const DREAM_CARD_FIELD_MAX_LENGTH = 1_000;
export const ROUTINE_MAX_ENTRIES = 24;
export const ROUTINE_TIME_MAX_LENGTH = 20;
export const ROUTINE_TEXT_MAX_LENGTH = 500;

const optionalTextSchema = z
  .string()
  .trim()
  .max(PATIENT_PROGRAM_SERVICE_ONE_TEXT_MAX_LENGTH)
  .nullable()
  .optional()
  .transform((value) => value?.trim() || null);

const confidenceScoreSchema = z.number().int().min(0).max(10);
/** SR-D8: Service 1 tools are recorded per round; the service checks that the round lists the tool. */
const serviceOneRoundNumberSchema = z.number().int().min(1).max(6);

export const patientProgramServiceOneActivitySchema = z.enum([
  "ROUTINE",
  "FLOATING_CHART",
  "DREAM_CARD",
  "CONFIDENCE",
]);

/** Records an evidence photo can be attached to; GOAL_PLAN = the signed plan page (R2-E). */
export const patientProgramServiceOneArtifactActivitySchema = z.enum([
  "ROUTINE",
  "FLOATING_CHART",
  "DREAM_CARD",
  "GOAL_PLAN",
]);

export type PatientProgramServiceOneActivity = z.output<
  typeof patientProgramServiceOneActivitySchema
>;
export type PatientProgramServiceOneArtifactActivity = z.output<
  typeof patientProgramServiceOneArtifactActivitySchema
>;

function optionalTrimmedText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);
}

/** R2-G: one row of ตารางชีวิตของฉัน: เวลา / กิจวัตรประจำวัน (required) / การปรับพฤติกรรม. */
export const routineEntrySchema = z
  .object({
    timeText: optionalTrimmedText(ROUTINE_TIME_MAX_LENGTH),
    activity: z.string().trim().min(1).max(ROUTINE_TEXT_MAX_LENGTH),
    adjustment: optionalTrimmedText(ROUTINE_TEXT_MAX_LENGTH),
  })
  .strict();

/**
 * R2-G: "วัน เดือน ปี" and 0-24 rows. Zero rows records the table for a photo of the paper page; the
 * step is done with at least one row or that photo.
 */
export const patientProgramServiceOneRoutineRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: serviceOneRoundNumberSchema,
    routineDate: serviceDateSchema,
    entries: z.array(routineEntrySchema).max(ROUTINE_MAX_ENTRIES),
  })
  .strict();

export const patientProgramServiceOneFloatingChartRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: serviceOneRoundNumberSchema,
    summary: optionalTextSchema,
  })
  .strict();

/** R2-G: ความฝันของฉัน: the dream and this week's small goal are required, the obstacle is optional. */
export const patientProgramServiceOneDreamCardRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: serviceOneRoundNumberSchema,
    dream: z.string().trim().min(1).max(DREAM_CARD_FIELD_MAX_LENGTH),
    obstacle: optionalTrimmedText(DREAM_CARD_FIELD_MAX_LENGTH),
    weeklyGoal: z.string().trim().min(1).max(DREAM_CARD_FIELD_MAX_LENGTH),
  })
  .strict();

export const patientProgramServiceOneConfidenceRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: serviceOneRoundNumberSchema,
    score: confidenceScoreSchema,
    improvementPlan: optionalTextSchema,
  })
  .strict();

export const patientProgramServiceOneArtifactAssociationRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    roundNumber: serviceOneRoundNumberSchema,
    patientEvidenceArtifactId: patientEvidenceArtifactIdSchema,
    activity: patientProgramServiceOneArtifactActivitySchema,
  })
  .strict();

export type RoutineEntryInput = z.output<typeof routineEntrySchema>;

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
  serviceOneRoundNumberSchema,
};
