import { z } from "zod";

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
    note: z.string().trim().max(1000).transform((value) => value || null).nullable(),
  })
  .strict()
  .refine(
    (value) => [value.weight, value.systolicBloodPressure, value.diastolicBloodPressure, value.bloodSugar].some((item) => item !== null),
    { message: "บันทึกค่าอย่างน้อยหนึ่งรายการ", path: ["weight"] },
  );

export const patientSelfMeasurementIdSchema = z.string().uuid();

export type PatientSelfMeasurementCreateInput = z.infer<typeof patientSelfMeasurementCreateSchema>;
