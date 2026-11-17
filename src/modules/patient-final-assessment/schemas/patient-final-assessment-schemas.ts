import { z } from "zod";

import {
  patientProgramIdSchema,
  patientProgramRelationshipIdSchema,
} from "@/modules/patient-program/schemas/patient-program-schemas";
import {
  clinicalMeasurementSchema,
  refineBloodPressureOrder,
  type ClinicalMeasurementKind,
} from "@/shared/clinical/clinical-value-limits";
import { cvdRiskScoreSchema } from "@/shared/clinical/cvd-risk-score";
import { serviceDateSchema } from "@/shared/time/service-date";

function optionalMeasurementSchema(kind: ClinicalMeasurementKind) {
  return clinicalMeasurementSchema(kind).nullable().optional();
}

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
    serviceDate: serviceDateSchema,
    weight: optionalMeasurementSchema("weight"),
    waistCircumference: optionalMeasurementSchema("waistCircumference"),
    systolicBloodPressure: optionalMeasurementSchema("systolicBloodPressure"),
    diastolicBloodPressure: optionalMeasurementSchema("diastolicBloodPressure"),
    bloodSugar: optionalMeasurementSchema("bloodSugar"),
    // After HbA1c (Phase A report gap fill); optional and not counted as a standalone measurement.
    hba1c: optionalMeasurementSchema("hba1c"),
    // D7 After CVD risk score; optional and not counted as a standalone measurement.
    cvdRiskScore: cvdRiskScoreSchema,
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

    refineBloodPressureOrder(
      input.systolicBloodPressure,
      input.diastolicBloodPressure,
      context,
      "systolicBloodPressure",
    );
  });

export type PatientFinalAssessmentCreateRequest = z.output<
  typeof patientFinalAssessmentCreateRequestSchema
>;

export const patientFinalAssessmentSchemaInternals = {
  measurementFieldNames,
};
