import { z } from "zod";

import {
  FOLLOWUP_PROGRESS_STATUS_VALUES,
  type FollowupProgressStatus,
} from "../domain/followup-definitions";

export const FOLLOWUP_NOTE_MAX_LENGTH = 2_000;
export const FOLLOWUP_ACTIVITY_NOTE_MAX_LENGTH = 1_000;
export const FOLLOWUP_MAX_PROGRESS_ROWS = 50;
export const FOLLOWUP_STRUCTURAL_NUMBER_MAX = 1_000_000;

export const followupRelationshipIdSchema = z.string().uuid();
export const followupIdSchema = z.string().uuid();
export const followupAppointmentIdSchema = z.string().uuid();
export const followupGoalPlanIdSchema = z.string().uuid();
export const followupSubmissionNonceSchema = z.string().uuid();
export const followupProgressStatusSchema = z.enum(FOLLOWUP_PROGRESS_STATUS_VALUES);

const optionalMeasurementSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(FOLLOWUP_STRUCTURAL_NUMBER_MAX)
  .nullable()
  .optional();

const optionalNoteSchema = z.string().trim().max(FOLLOWUP_NOTE_MAX_LENGTH).nullable().optional();

export const followupActivityProgressInputSchema = z
  .object({
    goalActivityCode: z.string().trim().min(1).max(64),
    status: followupProgressStatusSchema,
    note: z.string().trim().max(FOLLOWUP_ACTIVITY_NOTE_MAX_LENGTH).nullable().optional(),
  })
  .strict();

export const followupCreateRequestSchema = z
  .object({
    patientHospitalRelationshipId: followupRelationshipIdSchema,
    submissionNonce: followupSubmissionNonceSchema,
    appointmentId: followupAppointmentIdSchema.nullable().optional(),
    sourceGoalPlanId: followupGoalPlanIdSchema.nullable().optional(),
    weight: optionalMeasurementSchema,
    waistCircumference: optionalMeasurementSchema,
    systolicBloodPressure: optionalMeasurementSchema,
    diastolicBloodPressure: optionalMeasurementSchema,
    bloodSugar: optionalMeasurementSchema,
    confidenceScore: z.number().int().min(0).max(10).nullable().optional(),
    reflectionNote: optionalNoteSchema,
    confidencePlan: optionalNoteSchema,
    generalNote: optionalNoteSchema,
    activityProgress: z
      .array(followupActivityProgressInputSchema)
      .max(FOLLOWUP_MAX_PROGRESS_ROWS)
      .superRefine((rows, context) => {
        const seen = new Set<string>();

        rows.forEach((row, index) => {
          if (seen.has(row.goalActivityCode)) {
            context.addIssue({
              code: "custom",
              message: "Duplicate Goal activity codes are not allowed",
              path: [index, "goalActivityCode"],
            });
          }

          seen.add(row.goalActivityCode);
        });
      }),
  })
  .strict();

export type FollowupCreateRequest = z.output<typeof followupCreateRequestSchema>;

export type FollowupActivityProgressInput = z.output<
  typeof followupActivityProgressInputSchema
> & {
  status: FollowupProgressStatus;
};
