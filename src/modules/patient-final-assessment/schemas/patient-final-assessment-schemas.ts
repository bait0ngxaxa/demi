import { z } from "zod";

import {
  patientProgramIdSchema,
  patientProgramRelationshipIdSchema,
} from "@/modules/patient-program/schemas/patient-program-schemas";

export const PATIENT_FINAL_ASSESSMENT_STRUCTURAL_NUMBER_MAX = 1_000_000;

const optionalMeasurementSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(PATIENT_FINAL_ASSESSMENT_STRUCTURAL_NUMBER_MAX)
  .nullable()
  .optional();

const measurementFieldNames = [
  "weight",
  "waistCircumference",
  "systolicBloodPressure",
  "diastolicBloodPressure",
  "bloodSugar",
] as const;

export const patientFinalAssessmentCreateRequestSchema = z
  .object({
    patientProgramId: patientProgramIdSchema,
    patientHospitalRelationshipId: patientProgramRelationshipIdSchema,
    weight: optionalMeasurementSchema,
    waistCircumference: optionalMeasurementSchema,
    systolicBloodPressure: optionalMeasurementSchema,
    diastolicBloodPressure: optionalMeasurementSchema,
    bloodSugar: optionalMeasurementSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const hasMeasurement = measurementFieldNames.some((fieldName) => input[fieldName] != null);

    if (!hasMeasurement) {
      context.addIssue({
        code: "custom",
        message: "At least one Final Assessment measurement is required",
        path: ["weight"],
      });
    }
  });

export type PatientFinalAssessmentCreateRequest = z.output<
  typeof patientFinalAssessmentCreateRequestSchema
>;

export const patientFinalAssessmentSchemaInternals = {
  measurementFieldNames,
  optionalMeasurementSchema,
};
