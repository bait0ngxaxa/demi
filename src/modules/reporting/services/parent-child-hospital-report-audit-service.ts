import "server-only";

import { type PrismaClient } from "@prisma/client";

import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import { hospitalReportHospitalIdSchema } from "../schemas/hospital-report-schemas";

export type ParentChildHospitalReportingAuditOutcome = "read" | "prepared" | "denied" | "failed";
/** `read` is the existing summary view; `export` is the ADR-0013 RPT-32 nine-value workbook. */
export type ParentChildHospitalReportingAuditOperation = "read" | "export";
export type ParentChildHospitalReportingAuditReason =
  | "UNAUTHENTICATED"
  | "NOT_AUTHORIZED"
  | "SCOPE_UNAVAILABLE"
  | "UNAVAILABLE";

export async function recordParentChildHospitalReportingAudit(input: {
  actor?: ActorContext | null;
  parentHospitalId?: string;
  hospitalId?: string;
  operation?: ParentChildHospitalReportingAuditOperation;
  outcome: ParentChildHospitalReportingAuditOutcome;
  reason?: ParentChildHospitalReportingAuditReason;
}, database?: PrismaClient): Promise<void> {
  const actorUserId = input.actor?.userId
    ? hospitalReportHospitalIdSchema.safeParse(input.actor.userId)
    : null;
  const parentHospitalId = input.parentHospitalId
    ? hospitalReportHospitalIdSchema.safeParse(input.parentHospitalId)
    : null;
  const hospitalId = input.hospitalId
    ? hospitalReportHospitalIdSchema.safeParse(input.hospitalId)
    : null;

  const isExport = input.operation === "export";

  await recordAuditEvent({
    actorUserId: actorUserId?.success ? actorUserId.data : null,
    action: `parent_child_reporting.${isExport ? "export" : "access"}.${input.outcome}`,
    resourceType: hospitalId?.success ? "Hospital" : "ParentChildHospitalReporting",
    ...(hospitalId?.success ? { resourceId: hospitalId.data } : {}),
    metadata: {
      operation: isExport ? "PARENT_CHILD_REPORT_EXPORT" : "PARENT_CHILD_REPORT",
      outcome: input.outcome,
      ...(parentHospitalId?.success ? { parentHospitalId: parentHospitalId.data } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    },
  }, database);
}

export function parentChildHospitalReportingAuditReasonForError(
  error: unknown,
): ParentChildHospitalReportingAuditReason {
  if (error instanceof UnauthenticatedError) return "UNAUTHENTICATED";
  if (error instanceof NotFoundError) return "SCOPE_UNAVAILABLE";
  if (error instanceof ForbiddenError) return "NOT_AUTHORIZED";
  return "UNAVAILABLE";
}
