import { SupportReportCategory, SupportReportStatus } from "@prisma/client";
import { z } from "zod";
import { SUPPORT_REPORT_INBOX_ALL_STATUSES, SUPPORT_REPORT_INBOX_DEFAULT_STATUS } from "../domain/support-report";

export const supportReportCreateSchema = z.object({
  // WB-DF-14 (2026-10-26): optional context only; the platform ADMIN receives every report.
  hospitalId: z.string().uuid().optional(),
  category: z.nativeEnum(SupportReportCategory),
  message: z.string().trim().min(1).max(1_000),
}).strict();
export const supportReportLocatorSchema = z.string().uuid();
export const supportReportCursorInputSchema = z.string().max(2_048);
export const supportReportAdminInboxQuerySchema = z.object({
  // A missing status resolves to NEW here, so every entry point opens the same default view.
  status: z.union([z.nativeEnum(SupportReportStatus), z.literal(SUPPORT_REPORT_INBOX_ALL_STATUSES)]).default(SUPPORT_REPORT_INBOX_DEFAULT_STATUS),
  category: z.nativeEnum(SupportReportCategory).optional(),
  hospitalId: z.string().uuid().optional(),
  cursor: supportReportCursorInputSchema.optional(),
}).strict();
export const supportReportReporterHistoryQuerySchema = z.object({ cursor: supportReportCursorInputSchema.optional() }).strict();
export const supportReportStatusSchema = z.object({
  reportId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  status: z.enum([SupportReportStatus.ACKNOWLEDGED, SupportReportStatus.RESOLVED]),
}).strict();
