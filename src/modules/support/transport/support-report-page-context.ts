import "server-only";

import { notFound, redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";
import { getOwnerSupportReport, listOwnerSupportHospitals, listOwnerSupportReports, listOwnSupportHospitals } from "../services/support-report-service";

async function actorOrRedirect() {
  try { return await getProtectedApplicationActor(); }
  catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export async function getSupportFormContext() {
  const actor = await actorOrRedirect();
  const hospitals = await listOwnSupportHospitals(actor);
  if (hospitals.length === 0) redirect("/app");
  return { hospitals };
}

export async function getSupportInboxContext(hospitalId: string | undefined, cursor?: string) {
  const actor = await actorOrRedirect();
  const hospitals = await listOwnerSupportHospitals(actor);
  if (hospitals.length === 0) redirect("/app");
  const selectedId = hospitalId ?? hospitals[0]?.id;
  if (!selectedId || !hospitals.some(({ id }) => id === selectedId)) notFound();
  try { return { hospitals, selectedId, page: await listOwnerSupportReports(actor, cursor === undefined ? { hospitalId: selectedId } : { hospitalId: selectedId, cursor }) }; }
  catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
    if (error instanceof ValidationError) redirect(`/app/hospitals/support?hospitalId=${encodeURIComponent(selectedId)}`);
    throw error;
  }
}

export async function getSupportReportDetailContext(reportId: string) {
  const actor = await actorOrRedirect();
  try { return await getOwnerSupportReport(actor, reportId); }
  catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
    throw error;
  }
}
