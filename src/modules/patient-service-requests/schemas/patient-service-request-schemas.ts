import { PatientServiceCode } from "@prisma/client";
import { z } from "zod";

export const hospitalServiceOfferingMutationSchema = z
  .object({
    hospitalId: z.uuid(),
    code: z.nativeEnum(PatientServiceCode),
    enabled: z.boolean(),
  })
  .strict();

export const patientServiceRequestCreateSchema = z
  .object({
    relationshipId: z.uuid(),
    offeringId: z.uuid(),
    preferredOsmRelationshipId: z.uuid().nullable().optional(),
  })
  .strict();

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
