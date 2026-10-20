import { HospitalContentCategory } from "@prisma/client";
import { z } from "zod";
import { ValidationError } from "@/shared/errors/application-error";
import { HOSPITAL_CONTENT_PAGE_SIZE } from "../domain/hospital-content";
import { hospitalContentLocatorSchema } from "./hospital-content-schemas";

export const hospitalContentPatientCategorySchema = z.enum(HospitalContentCategory);
export const hospitalContentPatientRequestSchema = z.object({
  category: hospitalContentPatientCategorySchema.optional(),
  cursor: z.string().min(1).max(2_048).optional(),
  hospitalId: hospitalContentLocatorSchema.optional(),
  limit: z.number().int().min(1).max(HOSPITAL_CONTENT_PAGE_SIZE).optional(),
}).strict();
export type HospitalContentPatientRequest = z.infer<typeof hospitalContentPatientRequestSchema>;

export function parseHospitalContentPatientRequest(input: unknown): HospitalContentPatientRequest {
  const parsed = hospitalContentPatientRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Patient Content request is invalid");
  return parsed.data;
}
