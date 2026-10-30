import { PatientServiceCode, PatientServiceRequestSlot } from "@prisma/client";
import { z } from "zod";

import { serviceDateSchema } from "@/shared/time/service-date";

import { PATIENT_SERVICE_REQUEST_NOTE_MAX_LENGTH } from "../domain/patient-service-definitions";

export const hospitalServiceOfferingMutationSchema = z
  .object({
    hospitalId: z.uuid(),
    code: z.nativeEnum(PatientServiceCode),
    enabled: z.boolean(),
  })
  .strict();

/**
 * ADR-0023 (SR-D6): the preferred date and slot come together; the date range (tomorrow to +60 days,
 * Asia/Bangkok) depends on the request time and is checked by the service with `isValidPreferredDate`.
 * A blank note is no note.
 */
export const patientServiceRequestCreateSchema = z
  .object({
    relationshipId: z.uuid(),
    offeringId: z.uuid(),
    preferredOsmRelationshipId: z.uuid().nullable().optional(),
    preferredDate: serviceDateSchema.optional(),
    preferredSlot: z.nativeEnum(PatientServiceRequestSlot).optional(),
    note: z
      .string()
      .trim()
      .max(PATIENT_SERVICE_REQUEST_NOTE_MAX_LENGTH)
      .transform((note) => (note === "" ? undefined : note))
      .optional(),
  })
  .strict()
  .refine((value) => (value.preferredDate === undefined) === (value.preferredSlot === undefined), {
    path: ["preferredSlot"],
    message: "A preferred date and slot must be given together",
  });

export const patientServiceRequestIdSchema = z
  .object({ requestId: z.uuid() })
  .strict();

export const hospitalServiceRequestReviewInputSchema = z
  .object({
    requestId: z.uuid(),
    osmUserId: z.uuid().nullable().optional(),
    confirmReassignment: z.boolean().optional(),
  })
  .strict();

export const hospitalServiceRequestReviewSchema = hospitalServiceRequestReviewInputSchema
  .extend({ decision: z.enum(["APPROVE", "REJECT"]) })
  .superRefine((value, context) => {
    if (value.decision === "APPROVE" && !value.osmUserId) {
      context.addIssue({ code: "custom", path: ["osmUserId"], message: "An OSM must be selected for approval" });
    }
    if (value.decision === "REJECT" && value.osmUserId) {
      context.addIssue({ code: "custom", path: ["osmUserId"], message: "A rejected request cannot assign an OSM" });
    }
  });

export type HospitalServiceOfferingMutationInput = z.infer<
  typeof hospitalServiceOfferingMutationSchema
>;
export type PatientServiceRequestCreateInput = z.infer<
  typeof patientServiceRequestCreateSchema
>;
export type PatientServiceRequestIdInput = z.infer<typeof patientServiceRequestIdSchema>;

export const hospitalServiceRequestListSchema = z.object({
  group: z.enum(["PENDING", "APPROVED", "HISTORY"]).default("PENDING"),
  after: z.object({
    createdAt: z.iso.datetime(),
    requestId: z.uuid(),
  }).strict().optional(),
}).strict();

export type HospitalServiceRequestListInput = z.infer<typeof hospitalServiceRequestListSchema>;
