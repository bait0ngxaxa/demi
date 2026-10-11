import { z } from "zod";

export const hospitalReportHospitalIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

const cursorSchema = z.string().trim().min(1).max(512).optional();

export const hospitalReportPageRequestSchema = z
  .object({
    hospitalId: hospitalReportHospitalIdSchema,
    cursor: cursorSchema,
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export const hospitalReportExportRequestSchema = z
  .object({ hospitalId: hospitalReportHospitalIdSchema })
  .strict();

export type HospitalReportPageRequest = z.infer<typeof hospitalReportPageRequestSchema>;
export type HospitalReportExportRequest = z.infer<typeof hospitalReportExportRequestSchema>;
