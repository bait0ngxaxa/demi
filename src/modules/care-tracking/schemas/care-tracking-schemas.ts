import { z } from "zod";

import { PATIENT_DIRECTORY_NAME_MAX_LENGTH } from "@/modules/patient-directory/schemas/patient-directory-schemas";

import { CARE_SIGNALS, CARE_STAGES } from "../domain/care-stage";

export const CARE_TRACKING_PAGE_SIZE = 20;

const optionalSearchSchema = z.preprocess(
  (value: unknown) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized || undefined;
  },
  z.string().max(PATIENT_DIRECTORY_NAME_MAX_LENGTH).optional(),
);

export const careTrackingQuerySchema = z
  .object({
    /** The actor's own Hospital, or the network Parent when `childHospitalId` is given (CT-D3). */
    hospitalId: z.uuid().transform((value) => value.toLowerCase()),
    childHospitalId: z.uuid().transform((value) => value.toLowerCase()).optional(),
    stages: z.array(z.enum(CARE_STAGES)).max(CARE_STAGES.length).optional(),
    signals: z.array(z.enum(CARE_SIGNALS)).max(CARE_SIGNALS.length).optional(),
    /** Name terms or the exact HN, with the Patient directory's rules. */
    search: optionalSearchSchema,
    /** CT-D5: also list completed Programs; ended care relationships for the Hospital OWNER only. */
    includeEnded: z.boolean().optional(),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .refine(Number.isSafeInteger, "Page must be a safe integer")
      .default(1),
  })
  .strict();

export type CareTrackingQueryInput = z.infer<typeof careTrackingQuerySchema>;
