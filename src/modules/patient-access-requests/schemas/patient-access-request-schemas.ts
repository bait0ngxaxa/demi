import { z } from "zod";

import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

export const publicPatientAccessRequestSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    hospitalId: z.uuid(),
  })
  .strict();

export const patientAccessRequestReviewSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(["APPROVE", "REJECT"]),
    nationalId: thaiNationalIdSchema.optional(),
    identityVerified: z.literal(true).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.decision === "APPROVE" && input.nationalId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["nationalId"],
        message: "ต้องตรวจยืนยันเลขบัตรประชาชนก่อนอนุมัติ",
      });
    }

    if (input.decision === "APPROVE" && input.identityVerified !== true) {
      context.addIssue({
        code: "custom",
        path: ["identityVerified"],
        message: "ต้องยืนยันว่าได้ตรวจสอบตัวตนโดยตรงแล้ว",
      });
    }

    if (
      input.decision === "REJECT" &&
      (input.nationalId !== undefined || input.identityVerified !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "การปฏิเสธคำขอไม่รับข้อมูลยืนยันตัวตน",
      });
    }
  });

export const patientAccessRequestIdSchema = z
  .object({ requestId: z.uuid() })
  .strict();

export const hospitalPatientAccessRequestLookupSchema = publicPatientAccessRequestSchema;

export type PublicPatientAccessRequestInput = z.infer<
  typeof publicPatientAccessRequestSchema
>;
export type PatientAccessRequestReviewInput = z.infer<
  typeof patientAccessRequestReviewSchema
>;
export type PatientAccessRequestIdInput = z.infer<typeof patientAccessRequestIdSchema>;
