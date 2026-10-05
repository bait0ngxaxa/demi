import { HospitalContentCategory } from "@prisma/client";
import { z } from "zod";
import { ValidationError } from "@/shared/errors/application-error";

export const hospitalContentPatientCategorySchema = z.enum(HospitalContentCategory);
export const hospitalContentPatientRequestSchema = z.object({
  category: hospitalContentPatientCategorySchema.optional(),
  cursor: z.string().min(1).max(2_048).optional(),
}).strict();
export type HospitalContentPatientRequest = z.infer<typeof hospitalContentPatientRequestSchema>;

export function parseHospitalContentPatientRequest(input: unknown): HospitalContentPatientRequest {
  const parsed = hospitalContentPatientRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Patient Content request is invalid");
  return parsed.data;
}
