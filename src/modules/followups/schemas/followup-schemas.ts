import { z } from "zod";

import { patientProgramIdSchema } from "@/modules/patient-program/schemas/patient-program-schemas";
import { serviceDateSchema } from "@/shared/time/service-date";

import { FOLLOWUP_ACHIEVED_DAYS_MAX } from "../domain/followup-achievement";
import {
  FOLLOWUP_PROGRESS_STATUS_VALUES,
  type FollowupProgressStatus,
} from "../domain/followup-definitions";

export const FOLLOWUP_NOTE_MAX_LENGTH = 2_000;
export const FOLLOWUP_ACTIVITY_NOTE_MAX_LENGTH = 1_000;
export const FOLLOWUP_OBSTACLE_NOTE_MAX_LENGTH = 1_000;
export const FOLLOWUP_EXPERT_ADVICE_MAX_LENGTH = 1_000;
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
    achievedDays: z.number().int().min(0).max(FOLLOWUP_ACHIEVED_DAYS_MAX).nullable().optional(),
    note: z.string().trim().max(FOLLOWUP_ACTIVITY_NOTE_MAX_LENGTH).nullable().optional(),
  })
  .strict()
  .superRefine((row, context) => {
    const hasAchievedDays = row.achievedDays !== null && row.achievedDays !== undefined;

    if (row.status === "NOT_APPLICABLE" ? hasAchievedDays : !hasAchievedDays) {
      context.addIssue({
        code: "custom",
        message: "จำนวนวันที่ทำได้ต้องระบุสำหรับกิจกรรมที่เกี่ยวข้อง และต้องว่างเมื่อไม่เกี่ยวข้อง",
        path: ["achievedDays"],
      });
    }
  });

const followupPayloadSchema = z
  .object({
    submissionNonce: followupSubmissionNonceSchema,
    appointmentId: followupAppointmentIdSchema.nullable().optional(),
    sourceGoalPlanId: followupGoalPlanIdSchema.nullable().optional(),
    serviceDate: serviceDateSchema,
    planAdjusted: z.boolean(),
    hasObstacle: z.boolean(),
    obstacleNote: z.string().trim().max(FOLLOWUP_OBSTACLE_NOTE_MAX_LENGTH).nullable().optional(),
    weight: optionalMeasurementSchema,
    waistCircumference: optionalMeasurementSchema,
    systolicBloodPressure: optionalMeasurementSchema,
    diastolicBloodPressure: optionalMeasurementSchema,
    bloodSugar: optionalMeasurementSchema,
    // R2-D: height recorded in the round; the round otherwise uses the latest recorded height.
    heightCm: optionalMeasurementSchema,
    confidenceScore: z.number().int().min(0).max(10).nullable().optional(),
    // R2-F: shown as "เกิดอะไรขึ้นบ้าง?" in Program Follow-ups.
    reflectionNote: optionalNoteSchema,
    // R2-F: ทำตามแผนได้ / ทำตามแผนไม่ได้ (required for Program Follow-ups below).
    followedPlan: z.boolean().nullable().optional(),
    // R2-F / Q5: "คำแนะนำจากผู้เชี่ยวชาญ", optional.
    expertAdvice: z.string().trim().max(FOLLOWUP_EXPERT_ADVICE_MAX_LENGTH).nullable().optional(),
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
              message: "ไม่สามารถเลือกกิจกรรมซ้ำกันในแผนเป้าหมายได้",
              path: [index, "goalActivityCode"],
            });
          }

          seen.add(row.goalActivityCode);
        });
      }),
  })
  .strict();

function refineObstacleNote(
  payload: { hasObstacle: boolean; obstacleNote?: string | null },
  context: z.RefinementCtx,
): void {
  if (!payload.hasObstacle && payload.obstacleNote?.trim()) {
    context.addIssue({
      code: "custom",
      message: "บันทึกรายละเอียดอุปสรรคได้เฉพาะเมื่อระบุว่ามีอุปสรรค",
      path: ["obstacleNote"],
    });
  }
}

export const followupCreateRequestSchema = followupPayloadSchema
  .extend({ patientHospitalRelationshipId: followupRelationshipIdSchema })
  .strict()
  .superRefine(refineObstacleNote);

// SR-D8: a Program's confidence score is the per-round ไม้บรรทัดวัดใจ, so Program Follow-ups do not take one.
export const followupProgramCreateRequestSchema = followupPayloadSchema
  .omit({ confidenceScore: true, confidencePlan: true })
  .extend({
    patientProgramId: patientProgramIdSchema,
    followedPlan: z.boolean(),
    // R2-F: "เกิดอะไรขึ้นบ้าง?" is required, otherwise the round's plan review can never be done
    // (Follow-ups are immutable).
    reflectionNote: z.string().trim().min(1, "กรุณากรอก “เกิดอะไรขึ้นบ้าง?”").max(FOLLOWUP_NOTE_MAX_LENGTH),
  })
  .strict()
  .superRefine(refineObstacleNote);

export type FollowupCreateRequest = z.output<typeof followupCreateRequestSchema>;
export type FollowupProgramCreateRequest = z.output<typeof followupProgramCreateRequestSchema>;

export type FollowupActivityProgressInput = z.output<
  typeof followupActivityProgressInputSchema
> & {
  status: FollowupProgressStatus;
};
