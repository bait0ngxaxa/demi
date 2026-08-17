import { z } from "zod";

import {
  APPOINTMENT_LOCATION_VALUES,
  APPOINTMENT_TYPE_VALUES,
} from "../domain/appointment-definitions";

export const APPOINTMENT_NOTE_MAX_LENGTH = 2_000;
export const APPOINTMENT_LOCATION_DETAIL_MAX_LENGTH = 500;
export const APPOINTMENT_MIN_DURATION_MINUTES = 5;
export const APPOINTMENT_MAX_DURATION_MINUTES = 480;

export const appointmentRelationshipIdSchema = z.string().uuid();
export const appointmentIdSchema = z.string().uuid();
export const appointmentSubmissionNonceSchema = z.string().uuid();
export const appointmentScheduledAtSchema = z.iso.datetime({ offset: true });
export const appointmentTypeSchema = z.enum(APPOINTMENT_TYPE_VALUES);
export const appointmentLocationTypeSchema = z.enum(APPOINTMENT_LOCATION_VALUES);

const appointmentFieldsSchema = {
  scheduledAt: appointmentScheduledAtSchema,
  type: appointmentTypeSchema,
  responsibleUserId: z.string().uuid().nullable().optional(),
  durationMinutes: z
    .number()
    .int()
    .min(APPOINTMENT_MIN_DURATION_MINUTES)
    .max(APPOINTMENT_MAX_DURATION_MINUTES)
    .nullable()
    .optional(),
  locationType: appointmentLocationTypeSchema.nullable().optional(),
  locationDetail: z
    .string()
    .trim()
    .max(APPOINTMENT_LOCATION_DETAIL_MAX_LENGTH)
    .nullable()
    .optional(),
  note: z.string().trim().max(APPOINTMENT_NOTE_MAX_LENGTH).nullable().optional(),
} as const;

export const appointmentCreateRequestSchema = z
  .object({
    patientHospitalRelationshipId: appointmentRelationshipIdSchema,
    submissionNonce: appointmentSubmissionNonceSchema,
    ...appointmentFieldsSchema,
  })
  .strict();

export const appointmentRescheduleRequestSchema = z
  .object({
    patientHospitalRelationshipId: appointmentRelationshipIdSchema,
    appointmentId: appointmentIdSchema,
    expectedUpdatedAt: appointmentScheduledAtSchema,
    ...appointmentFieldsSchema,
  })
  .strict();

export const appointmentTransitionRequestSchema = z
  .object({
    patientHospitalRelationshipId: appointmentRelationshipIdSchema,
    appointmentId: appointmentIdSchema,
    expectedUpdatedAt: appointmentScheduledAtSchema,
  })
  .strict();

export type AppointmentCreateRequest = z.output<typeof appointmentCreateRequestSchema>;
export type AppointmentRescheduleRequest = z.output<typeof appointmentRescheduleRequestSchema>;
export type AppointmentTransitionRequest = z.output<typeof appointmentTransitionRequestSchema>;
