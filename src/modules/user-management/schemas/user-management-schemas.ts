import { z } from "zod";

import { userKindSchema } from "../domain/user-management-values";

const userRecordMutationFields = {
  kind: userKindSchema,
  relationshipId: z.uuid(),
  targetHospitalId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
} as const;

/** UM-D2a: the OWNER types the exact phrase; the server alone decides whether the record is deletable. */
export const userRecordDeletionSchema = z.object({
  ...userRecordMutationFields,
  confirmation: z.literal("ลบรายการ"),
}).strict();

/** UM-D5: suspected takeover lock. Repeating it retries only the provider session revocation. */
export const suspectedTakeoverLockSchema = z.object({
  ...userRecordMutationFields,
  confirmation: z.literal("ไม่ใช่เจ้าของจริง"),
}).strict();

export type UserRecordDeletionInput = z.infer<typeof userRecordDeletionSchema>;
export type SuspectedTakeoverLockInput = z.infer<typeof suspectedTakeoverLockSchema>;
