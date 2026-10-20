import { z } from "zod";

import { canonicalCodePattern } from "@/modules/hospital-hierarchy/services/hospital-master-reconciliation-service";

export const hospitalGovernanceHospitalIdSchema = z.uuid();
export const hospitalGovernanceExpectedUpdatedAtSchema = z.iso.datetime({ offset: true });

export const hospitalGovernanceMutationSchema = z
  .object({
    hospitalId: hospitalGovernanceHospitalIdSchema,
    expectedUpdatedAt: hospitalGovernanceExpectedUpdatedAtSchema,
  })
  .strict();

export type HospitalGovernanceMutationInput = z.infer<typeof hospitalGovernanceMutationSchema>;

const hospitalNameSchema = z.string().trim().min(1).max(200);

// Same canonical code rule as Hospital Master reconciliation, so both registry paths agree.
export const hospitalGovernanceCreateSchema = z
  .object({
    hospitalCode: z.string().trim().toUpperCase().regex(canonicalCodePattern),
    name: hospitalNameSchema,
    // ADR-0015: network type is chosen in the same step; editable later.
    networkRole: z.enum(["PARENT", "CHILD"]),
  })
  .strict();

export const hospitalGovernanceRenameSchema = hospitalGovernanceMutationSchema.extend({
  name: hospitalNameSchema,
});
