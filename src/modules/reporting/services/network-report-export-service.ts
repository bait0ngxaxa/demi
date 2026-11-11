import "server-only";

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import type { NetworkReportingDataset } from "../projections/hospital-report-projection";
import { networkReportExportRequestSchema } from "../schemas/hospital-report-schemas";
import { getNetworkReportingDatasetForExport } from "./hospital-report-query-service";
import { generateNetworkReportWorkbook } from "./hospital-report-workbook-service";
import { resolveNetworkReportExportContext, type NetworkReportExportContext } from "./network-report-access-service";
import {
  networkReportExportAuditReasonForError,
  recordNetworkReportExportPrepared,
  recordNetworkReportExportRefusal,
} from "./network-report-audit-service";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

/**
 * ADR-0025: an ACTIVE OWNER or MEMBER of an ACTIVE Parent downloads one workbook for the Parent and all or
 * selected network Hospitals. Authority is resolved inside the read snapshot, re-checked for the exact exported
 * Hospitals after the file is built, and every outcome is audited; no audit, no file.
 */
export async function exportNetworkReportWorkbook(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: { database?: PrismaClient } = {},
): Promise<{ buffer: Buffer; generatedAt: Date; parent: NetworkReportingDataset["parent"] }> {
  const parsed = networkReportExportRequestSchema.safeParse(input);
  const database = dependencies.database ?? getPrisma();
  const generatedAt = new Date();
  let dataset: NetworkReportingDataset;
  let buffer: Buffer;
  let access: NetworkReportExportContext;
  try {
    if (!parsed.success) throw new ValidationError("ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง");
    dataset = await getNetworkReportingDatasetForExport(actor, parsed.data, { database });
    buffer = await generateNetworkReportWorkbook(dataset, generatedAt);
    access = await resolveNetworkReportExportContext(actor, {
      parentHospitalId: dataset.parent.id,
      hospitalIds: dataset.hospitals.map(({ hospital }) => hospital.id),
      cohort: dataset.cohort,
    }, database);
  } catch (error: unknown) {
    const failed = !(error instanceof ApplicationError) || error.code === "INFRASTRUCTURE";
    try {
      await recordNetworkReportExportRefusal({
        actor,
        ...(parsed.success ? { request: parsed.data } : {}),
        outcome: failed ? "failed" : "denied",
        reason: networkReportExportAuditReasonForError(error),
      }, database);
    } catch (error: unknown) {
      throw toInfrastructureError("reporting.exportNetworkReportWorkbook", error, "Network report export could not be prepared");
    }

    if (!failed) throw error;
    throw error instanceof InfrastructureError ? error : toInfrastructureError("reporting.exportNetworkReportWorkbook", error, "Network report export could not be prepared");
  }

  try {
    await recordNetworkReportExportPrepared({
      access,
      dataset,
      cohort: dataset.cohort,
      generatedAt,
      exportReference: randomUUID(),
    }, database);
  } catch (error: unknown) {
    // No audit, no file: an unaudited disclosure must not reach the browser.
    throw toInfrastructureError("reporting.exportNetworkReportWorkbook", error, "Network report export could not be prepared");
  }

  return { buffer, generatedAt, parent: dataset.parent };
}
