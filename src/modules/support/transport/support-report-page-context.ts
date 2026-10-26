import "server-only";

import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";
import { canSubmitSupportReport } from "../domain/support-report";
import { getAdminSupportReport, getOwnSupportReport, listAdminSupportReports, listOwnSupportHospitals, listOwnSupportReports, type SupportReportAdminDetail, type SupportReportAdminInboxPage, type SupportReportDetail, type SupportReportPage } from "../services/support-report-service";

async function actorOrRedirect(): Promise<ActorContext> {
  try { return await getProtectedApplicationActor(); }
  catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

/** WB-DF-14 (2026-10-26): every non-ADMIN account may report, with or without a Hospital to name. */
export async function getSupportFormContext(): Promise<{ hospitals: Array<{ id: string; name: string; hospitalCode: string }> }> {
  const actor = await actorOrRedirect();
  if (!canSubmitSupportReport(actor.roles)) redirect("/app");
  return { hospitals: await listOwnSupportHospitals(actor) };
}

/** Consistent with the form: an ADMIN has no reporter pages. The service own-report filter remains the boundary. */
async function submitterOrRedirect(): Promise<ActorContext> {
  const actor = await actorOrRedirect();
  if (!canSubmitSupportReport(actor.roles)) redirect("/app");
  return actor;
}

export async function getSupportHistoryContext(cursor?: string): Promise<SupportReportPage> {
  const actor = await submitterOrRedirect();
  try { return await listOwnSupportReports(actor, cursor === undefined ? {} : { cursor }); }
  catch (error: unknown) {
    if (error instanceof ValidationError) redirect("/app/support/reports");
    throw error;
  }
}

export async function getSupportHistoryDetailContext(reportId: string): Promise<SupportReportDetail> {
  const actor = await submitterOrRedirect();
  try { return await getOwnSupportReport(actor, reportId); }
  catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export type AdminSupportInboxFilters = { status?: string; category?: string; hospitalId?: string; cursor?: string };

async function adminOrRedirect(): Promise<ActorContext> {
  const actor = await actorOrRedirect();
  if (!actor.roles.includes(Role.ADMIN)) redirect("/app");
  return actor;
}

export async function getAdminSupportInboxContext(filters: AdminSupportInboxFilters): Promise<SupportReportAdminInboxPage> {
  const actor = await adminOrRedirect();
  try { return await listAdminSupportReports(actor, filters); }
  catch (error: unknown) {
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof ValidationError) redirect("/app/admin/support");
    throw error;
  }
}

export async function getAdminSupportReportDetailContext(reportId: string): Promise<SupportReportAdminDetail> {
  const actor = await adminOrRedirect();
  try { return await getAdminSupportReport(actor, reportId); }
  catch (error: unknown) {
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
