import { z } from "zod";

import {
  PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT,
  PATIENT_SELF_MEASUREMENT_CURSOR_MAX_LENGTH,
} from "../domain/patient-self-measurement";
import { FOLLOWUP_STRUCTURAL_NUMBER_MAX } from "@/modules/followups/schemas/followup-schemas";

// Same value range as PatientFollowup measurements (and the SQL CHECK).
const optionalMeasurementSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(FOLLOWUP_STRUCTURAL_NUMBER_MAX)
  .nullable();

export const patientSelfMeasurementCreateSchema = z
  .object({
    submissionNonce: z.string().uuid(),
    measuredAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
    weight: optionalMeasurementSchema,
    systolicBloodPressure: optionalMeasurementSchema,
    diastolicBloodPressure: optionalMeasurementSchema,
    bloodSugar: optionalMeasurementSchema,
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
