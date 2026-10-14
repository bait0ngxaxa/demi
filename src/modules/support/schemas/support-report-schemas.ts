import { SupportReportCategory, SupportReportStatus } from "@prisma/client";
import { z } from "zod";

export const supportReportCreateSchema = z.object({
  hospitalId: z.string().uuid(),
  category: z.nativeEnum(SupportReportCategory),
  message: z.string().trim().min(1).max(1_000),
}).strict();
export const supportReportLocatorSchema = z.string().uuid();
export const supportReportInboxQuerySchema = z.object({ hospitalId: z.string().uuid(), cursor: z.string().max(2_048).optional() }).strict();
export const supportReportStatusSchema = z.object({
  reportId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  status: z.enum([SupportReportStatus.ACKNOWLEDGED, SupportReportStatus.RESOLVED]),
}).strict();
