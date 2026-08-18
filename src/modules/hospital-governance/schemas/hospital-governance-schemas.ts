import { z } from "zod";

export const hospitalGovernanceHospitalIdSchema = z.uuid();
export const hospitalGovernanceExpectedUpdatedAtSchema = z.iso.datetime({ offset: true });

export const hospitalGovernanceMutationSchema = z
  .object({
    hospitalId: hospitalGovernanceHospitalIdSchema,
    expectedUpdatedAt: hospitalGovernanceExpectedUpdatedAtSchema,
  })
  .strict();

export type HospitalGovernanceMutationInput = z.infer<typeof hospitalGovernanceMutationSchema>;
