import { z } from "zod";

export const PATIENT_BASELINE_TEXT_MAX_LENGTH = 2_000;
export const PATIENT_BASELINE_STRUCTURAL_NUMBER_MAX = 1_000_000;

export const patientBaselineRelationshipIdSchema = z.string().uuid();
export const patientBaselineIdSchema = z.string().uuid();

function isValidDateOnly(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const patientBaselineDateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine(isValidDateOnly, "The Baseline recorded date is invalid");

export const patientBaselineMeasurementSchema = z
  .number()
  .finite()
  .positive()
  .max(PATIENT_BASELINE_STRUCTURAL_NUMBER_MAX);

const optionalMeasurementSchema = patientBaselineMeasurementSchema
  .nullable()
  .optional();

const optionalTextSchema = z
  .string()
  .trim()
  .max(PATIENT_BASELINE_TEXT_MAX_LENGTH)
  .nullable()
  .optional()
  .transform((value) => value?.trim() || null);

export const patientBaselineCreateRequestSchema = z
  .object({
    patientHospitalRelationshipId: patientBaselineRelationshipIdSchema,
    recordedOn: patientBaselineDateOnlySchema,
    weight: optionalMeasurementSchema,
    heightCm: optionalMeasurementSchema,
    waistCircumference: optionalMeasurementSchema,
    bloodPressureSystolic: optionalMeasurementSchema,
    bloodPressureDiastolic: optionalMeasurementSchema,
    bloodSugarDtx: optionalMeasurementSchema,
    hba1c: optionalMeasurementSchema,
    adaptationSummary: optionalTextSchema,
    adaptationObstacles: optionalTextSchema,
    adaptationOpportunities: optionalTextSchema,
    confidenceScore: z.number().int().min(0).max(10).nullable().optional(),
    confidenceImprovementPlan: optionalTextSchema,
    summary: optionalTextSchema,
    recommendations: optionalTextSchema,
  })
  .strict();

export type PatientBaselineCreateRequest = z.output<typeof patientBaselineCreateRequestSchema>;

export function dateOnlyToUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
