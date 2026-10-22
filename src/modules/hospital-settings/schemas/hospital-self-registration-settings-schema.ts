import { z } from "zod";

export const hospitalSelfRegistrationSettingSchema = z.object({
  hospitalId: z.uuid(),
  enabled: z.boolean(),
}).strict();

export type HospitalSelfRegistrationSettingInput = z.infer<typeof hospitalSelfRegistrationSettingSchema>;
