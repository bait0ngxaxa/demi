import { PatientServiceCode, PatientServiceRequestSlot } from "@prisma/client";
import { z } from "zod";

import { serviceDateSchema } from "@/shared/time/service-date";

import {
  APPOINTMENT_LOCATION_DETAIL_MAX_LENGTH,
  APPOINTMENT_MAX_DURATION_MINUTES,
  APPOINTMENT_MIN_DURATION_MINUTES,
  APPOINTMENT_NOTE_MAX_LENGTH,
  appointmentScheduledAtSchema,
} from "@/modules/appointments/schemas/appointment-schemas";

import {
  PATIENT_SERVICE_REQUEST_NOTE_MAX_LENGTH,
  PATIENT_SERVICE_REQUEST_REJECTION_REASON_MAX_LENGTH,
} from "../domain/patient-service-definitions";

export const hospitalServiceOfferingMutationSchema = z
  .object({
    hospitalId: z.uuid(),
    code: z.nativeEnum(PatientServiceCode),
    enabled: z.boolean(),
  })
  .strict();

/**
 * ADR-0023 (SR-D6): a request states a preferred date and slot; the date range (tomorrow to +60 days,
 * Asia/Bangkok) depends on the request time and is checked by the service with `isValidPreferredDate`.
 * A blank note is no note.
 */
export const patientServiceRequestCreateSchema = z
  .object({
    relationshipId: z.uuid(),
    offeringId: z.uuid(),
    preferredOsmRelationshipId: z.uuid().nullable().optional(),
    preferredDate: serviceDateSchema,
    preferredSlot: z.nativeEnum(PatientServiceRequestSlot),
    note: z
      .string()
      .trim()
      .max(PATIENT_SERVICE_REQUEST_NOTE_MAX_LENGTH)
      .transform((note) => (note === "" ? undefined : note))
      .optional(),
  })
  .strict();

export const patientServiceRequestIdSchema = z
  .object({ requestId: z.uuid() })
  .strict();

/** ADR-0023 (SR-D1): staff confirm a request by booking its appointment; the nonce makes a retry idempotent. */
export const patientServiceRequestConfirmSchema = z
  .object({
    requestId: z.uuid(),
    scheduledAt: appointmentScheduledAtSchema,
    durationMinutes: z
      .number()
      .int()
      .min(APPOINTMENT_MIN_DURATION_MINUTES)
      .max(APPOINTMENT_MAX_DURATION_MINUTES)
      .nullable()
      .optional(),
    locationDetail: z.string().trim().max(APPOINTMENT_LOCATION_DETAIL_MAX_LENGTH).nullable().optional(),
    osmUserId: z.uuid(),
    note: z.string().trim().max(APPOINTMENT_NOTE_MAX_LENGTH).nullable().optional(),
    submissionNonce: z.uuid(),
  })
  .strict();

/** ADR-0023 (SR-D1): a rejection always carries a reason, shown to the patient. */
export const patientServiceRequestRejectSchema = z
  .object({
    requestId: z.uuid(),
    reason: z.string().trim().min(1).max(PATIENT_SERVICE_REQUEST_REJECTION_REASON_MAX_LENGTH),
  })
  .strict();

export type HospitalServiceOfferingMutationInput = z.infer<
  typeof hospitalServiceOfferingMutationSchema
>;
export type PatientServiceRequestCreateInput = z.infer<
  typeof patientServiceRequestCreateSchema
>;
export type PatientServiceRequestIdInput = z.infer<typeof patientServiceRequestIdSchema>;
export type PatientServiceRequestConfirmInput = z.infer<typeof patientServiceRequestConfirmSchema>;

export const hospitalServiceRequestListSchema = z.object({
  group: z.enum(["PENDING", "APPROVED", "HISTORY"]).default("PENDING"),
  after: z.object({
    createdAt: z.iso.datetime(),
    preferredDate: serviceDateSchema.nullable().optional(),
    requestId: z.uuid(),
  }).strict().optional(),
}).strict().refine((input) => input.group !== "PENDING" || !input.after || input.after.preferredDate !== undefined, {
  message: "Pending cursor requires its preferred date (null for legacy requests)",
});

export type HospitalServiceRequestListInput = z.infer<typeof hospitalServiceRequestListSchema>;
