import { z } from "zod";

const id = z.string().uuid().transform((value) => value.toLowerCase());
export const serviceAreaParentSchema = z.object({ parentHospitalId: id }).strict();
export const serviceAreaAttachSchema = serviceAreaParentSchema.extend({ childHospitalId: id });
export const serviceAreaEndSchema = serviceAreaParentSchema.extend({
  areaId: id,
  confirm: z.literal(true),
  endReason: z.string().trim().min(1).max(500),
});
export const serviceAreaPageSchema = serviceAreaParentSchema.extend({
  afterId: id.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
