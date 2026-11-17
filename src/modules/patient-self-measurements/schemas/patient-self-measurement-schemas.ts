import { z } from "zod";

import {
  PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT,
  PATIENT_SELF_MEASUREMENT_CURSOR_MAX_LENGTH,
} from "../domain/patient-self-measurement";
import {
  BLOOD_PRESSURE_ORDER_MESSAGE,
  clinicalMeasurementSchema,
  isBloodPressureOrderValid,
  type ClinicalMeasurementKind,
} from "@/shared/clinical/clinical-value-limits";

// N3: the shared clinical limits; the SQL CHECK stays a structural backstop.
function optionalMeasurementSchema(kind: ClinicalMeasurementKind) {
  return clinicalMeasurementSchema(kind).nullable();
}

export const patientSelfMeasurementCreateSchema = z
  .object({
    submissionNonce: z.string().uuid(),
    measuredAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
    weight: optionalMeasurementSchema("weight"),
    systolicBloodPressure: optionalMeasurementSchema("systolicBloodPressure"),
    diastolicBloodPressure: optionalMeasurementSchema("diastolicBloodPressure"),
    bloodSugar: optionalMeasurementSchema("bloodSugar"),
    bloodSugarUnit: z.literal(PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT).optional(),
    note: z.string().trim().max(1000).transform((value) => value || null).nullable(),
  })
  .strict()
  .refine(
    (value) => [value.weight, value.systolicBloodPressure, value.diastolicBloodPressure, value.bloodSugar].some((item) => item !== null),
    { message: "บันทึกค่าอย่างน้อยหนึ่งรายการ", path: ["weight"] },
  )
  .refine(
    (value) => value.bloodSugar === null || value.bloodSugarUnit === PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT,
    { message: "กรุณาระบุหน่วยน้ำตาลเป็น mg/dL", path: ["bloodSugarUnit"] },
  )
  .refine(
    (value) => isBloodPressureOrderValid(value.systolicBloodPressure, value.diastolicBloodPressure),
    { message: BLOOD_PRESSURE_ORDER_MESSAGE, path: ["systolicBloodPressure"] },
  );

export const patientSelfMeasurementIdSchema = z.string().uuid();

export const patientSelfMeasurementListSchema = z.object({
  cursor: z.string().min(1).max(PATIENT_SELF_MEASUREMENT_CURSOR_MAX_LENGTH).optional(),
}).strict();

export const patientSelfMeasurementCursorSchema = z.object({
  version: z.literal(1),
  scope: z.enum(["OWN", "CARE_TEAM"]),
  scopeId: z.string().uuid(),
  measurementId: z.string().uuid(),
  measuredAt: z.string().datetime({ offset: true }),
}).strict();

export type PatientSelfMeasurementCreateInput = z.infer<typeof patientSelfMeasurementCreateSchema>;
export type PatientSelfMeasurementCursor = z.infer<typeof patientSelfMeasurementCursorSchema>;
