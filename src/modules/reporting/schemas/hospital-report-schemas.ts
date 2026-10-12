import { z } from "zod";

export const hospitalReportHospitalIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

export type HospitalReportTargetSelection =
  | { kind: "DIRECT_OWNER"; hospitalId: string }
  | { kind: "PARENT_CHILD"; parentHospitalId: string; hospitalId: string };

export function parseHospitalReportTargetSelection(value: unknown): HospitalReportTargetSelection | null {
  const parsedToken = z.string().trim().min(1).max(128).safeParse(value);
  if (!parsedToken.success) return null;

  const parts = parsedToken.data.split(":");
  if (parts[0] === "DIRECT_OWNER" && parts.length === 2) {
    const hospitalId = hospitalReportHospitalIdSchema.safeParse(parts[1]);
    return hospitalId.success ? { kind: "DIRECT_OWNER", hospitalId: hospitalId.data } : null;
  }

  if (parts[0] === "PARENT_CHILD" && parts.length === 3) {
    const parentHospitalId = hospitalReportHospitalIdSchema.safeParse(parts[1]);
    const hospitalId = hospitalReportHospitalIdSchema.safeParse(parts[2]);
    if (!parentHospitalId.success || !hospitalId.success || parentHospitalId.data === hospitalId.data) return null;
    return { kind: "PARENT_CHILD", parentHospitalId: parentHospitalId.data, hospitalId: hospitalId.data };
  }

  return null;
}

export const parentChildHospitalReportRequestSchema = z
  .object({
    parentHospitalId: hospitalReportHospitalIdSchema,
    hospitalId: hospitalReportHospitalIdSchema,
  })
  .strict()
  .refine(({ parentHospitalId, hospitalId }) => parentHospitalId !== hospitalId);

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
