import "server-only";

import { notFound, redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import { getAppointmentGrantManagement, type AppointmentGrantManagement } from "../services/appointment-grant-management-query-service";
import { getFamilyManagementOverview, type FamilyManagementOverview } from "../services/caregiver-relationship-query-service";
import { getDelegatedAppointment, type DelegatedAppointmentDetail } from "../services/delegated-appointment-query-service";
import { getResourceGrantManagement, type ResourceGrantManagement } from "../services/caregiver-resource-grant-service";
import { getFamilyHealthSummary, type FamilyHealthSummary } from "../services/family-health-summary-query-service";

function handleReadError(error: unknown): never {
  if (error instanceof UnauthenticatedError) redirect("/login");
  if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
  throw error;
}

export async function getFamilyAppointmentWorkspacePageContext(relationshipInput: unknown, grantInput: unknown): Promise<{
  overview: FamilyManagementOverview; management: AppointmentGrantManagement | null; resources: ResourceGrantManagement | null;
}> {
  try {
    const actor = await getProtectedApplicationActor();
    const [overview, management, resources] = await Promise.all([
      getFamilyManagementOverview(actor, relationshipInput), getAppointmentGrantManagement(actor, grantInput), getResourceGrantManagement(actor),
    ]);
    return { overview, management, resources };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export async function getDelegatedAppointmentPageContext(grantId: unknown, appointmentId: unknown): Promise<DelegatedAppointmentDetail> {
  try { return await getDelegatedAppointment(await getProtectedApplicationActor(), grantId, appointmentId); }
  catch (error: unknown) { handleReadError(error); }
}

/** AF-5: a relationship that is not (or no longer) the actor's ACTIVE caregiver relationship is a plain 404. */
export async function getFamilyHealthSummaryPageContext(relationshipId: unknown): Promise<FamilyHealthSummary> {
  try { return await getFamilyHealthSummary(await getProtectedApplicationActor(), relationshipId); }
  catch (error: unknown) { handleReadError(error); }
}
