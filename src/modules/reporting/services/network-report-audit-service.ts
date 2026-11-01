import "server-only";

import type { PrismaClient } from "@prisma/client";

import type { AuditEventInput } from "@/modules/audit/schemas/audit-schemas";
import { recordAuditEvent, recordAuditEvents } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, UnauthenticatedError } from "@/shared/errors/application-error";

import type { NetworkReportingDataset } from "../projections/hospital-report-projection";
import type { HospitalReportCohort, NetworkReportExportRequest } from "../schemas/hospital-report-schemas";
import { HospitalReportExportLimitError } from "./hospital-report-query-service";
import type { NetworkReportExportContext } from "./network-report-access-service";
import { parentChildHospitalReportingAuditEvent } from "./parent-child-hospital-report-audit-service";

const OPERATION = "NETWORK_REPORT_EXPORT";

export type NetworkReportExportAuditReason =
  | "UNAUTHENTICATED"
  | "INVALID_REQUEST"
  | "NOT_AUTHORIZED"
  | "SCOPE_UNAVAILABLE"
  | "TARGET_NOT_ELIGIBLE"
  | "LIMIT_EXCEEDED"
  | "UNAVAILABLE";

export function networkReportExportAuditReasonForError(error: unknown): NetworkReportExportAuditReason {
  if (error instanceof UnauthenticatedError) return "UNAUTHENTICATED";
  if (!(error instanceof ApplicationError)) return "UNAVAILABLE";
  if (error instanceof HospitalReportExportLimitError) return "LIMIT_EXCEEDED";
  switch (error.code) {
    case "VALIDATION": return "INVALID_REQUEST";
    case "NOT_FOUND": return "SCOPE_UNAVAILABLE";
    case "FORBIDDEN": return "NOT_AUTHORIZED";
    case "CONFLICT": return "TARGET_NOT_ELIGIBLE";
    default: return "UNAVAILABLE";
  }
}

/** A refused or failed network export: one event, no Patient data and no requested Hospital list. */
export async function recordNetworkReportExportRefusal(input: {
  actor?: ActorContext | null;
  request?: NetworkReportExportRequest;
  outcome: "denied" | "failed";
  reason: NetworkReportExportAuditReason;
}, database?: PrismaClient): Promise<void> {
  await recordAuditEvent({
    actorUserId: input.actor?.userId ?? null,
    action: `hospital_reporting.network_export.${input.outcome}`,
    resourceType: input.request ? "Hospital" : "NetworkReportExport",
    ...(input.request ? { resourceId: input.request.parentHospitalId } : {}),
    metadata: {
      operation: OPERATION,
      outcome: input.outcome,
      reason: input.reason,
      ...(input.request
        ? {
            parentHospitalId: input.request.parentHospitalId,
            cohort: input.request.cohort ?? "ACTIVE",
            requestedScope: input.request.hospitalIds === "ALL" ? "ALL" : "SELECTED",
            ...(input.request.hospitalIds === "ALL" ? {} : { requestedHospitalCount: input.request.hospitalIds.length }),
          }
        : {}),
    },
  }, database);
}

/**
 * The prepared network event and one `parent_child_reporting.export.prepared` per Child, written together.
 * Audit metadata holds scalars only, so the exported Hospital list is the Parent (when `includesParent`) plus
 * the Child events sharing `exportReference`.
 */
export async function recordNetworkReportExportPrepared(input: {
  access: NetworkReportExportContext;
  dataset: NetworkReportingDataset;
  cohort: HospitalReportCohort;
  generatedAt: Date;
  exportReference: string;
}, database?: PrismaClient): Promise<void> {
  const { access, dataset } = input;
  const children = dataset.hospitals.filter(({ hospital }) => hospital.kind === "CHILD");
  const events: AuditEventInput[] = [
    {
      actorUserId: access.actor.userId,
      action: "hospital_reporting.network_export.prepared",
      resourceType: "Hospital",
      resourceId: dataset.parent.id,
      metadata: {
        operation: OPERATION,
        outcome: "prepared",
        parentHospitalId: dataset.parent.id,
        accessBasis: access.accessBasis,
        exportReference: input.exportReference,
        hospitalCount: dataset.hospitals.length,
        includesParent: dataset.hospitals.some(({ hospital }) => hospital.kind === "PARENT"),
        childHospitalCount: children.length,
        programCount: dataset.hospitals.reduce((sum, { programs }) => sum + programs.length, 0),
        cohort: input.cohort,
        generatedAt: input.generatedAt.toISOString(),
      },
    },
    ...children.map(({ hospital }) => parentChildHospitalReportingAuditEvent({
      actor: access.actor,
      parentHospitalId: dataset.parent.id,
      hospitalId: hospital.id,
      operation: "export",
      outcome: "prepared",
      network: { scope: "NETWORK_EXPORT", exportReference: input.exportReference },
    })),
  ];
  await recordAuditEvents(events, database);
}
