import "server-only";

import { notFound, redirect } from "next/navigation";
import { getRequestApplicationActor } from "@/modules/auth/services/request-application-actor";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import { getAppointmentGrantManagement, type AppointmentGrantManagement } from "../services/appointment-grant-management-query-service";
import { getFamilyManagementOverview, type FamilyManagementOverview } from "../services/caregiver-relationship-query-service";
import { getDelegatedAppointment, type DelegatedAppointmentDetail } from "../services/delegated-appointment-query-service";
import { getResourceGrantManagement, type ResourceGrantManagement } from "../services/caregiver-resource-grant-service";
import { getFamilyHealthSummary, type FamilyHealthSummary } from "../services/family-health-summary-query-service";
import { canUseFamilyWorkspace } from "../domain/family-access";

/** A platform ADMIN is sent home before any Family data is read. `redirect` throws, so callers' catch rethrows it. */
async function getFamilyWorkspaceActor(): Promise<ActorContext> {
  const actor = await getRequestApplicationActor();
  if (!canUseFamilyWorkspace(actor.roles)) redirect("/app");
  return actor;
}

/**
 * The invitation page also serves signed-out recipients, so only a signed-in platform ADMIN is singled out. A failed
 * lookup keeps the existing page: acceptance itself still refuses an ADMIN on the server.
 */
export async function isSignedInPlatformAdminViewer(): Promise<boolean> {
  try {
    const actor = await getRequestApplicationActor();
    return !canUseFamilyWorkspace(actor.roles);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) return false;
    throw error;
  }
}

/** For Family routes that only redirect onward: the same ADMIN and sign-in rules as the Family pages. */
export async function assertFamilyWorkspacePageAccess(): Promise<void> {
  try {
    await getFamilyWorkspaceActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

function handleReadError(error: unknown): never {
  if (error instanceof UnauthenticatedError) redirect("/login");
  if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
  throw error;
}

export async function getFamilyAppointmentWorkspacePageContext(relationshipInput: unknown, grantInput: unknown): Promise<{
  overview: FamilyManagementOverview; management: AppointmentGrantManagement; resources: ResourceGrantManagement;
}> {
  try {
    const actor = await getFamilyWorkspaceActor();
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
  try { return await getDelegatedAppointment(await getFamilyWorkspaceActor(), grantId, appointmentId); }
  catch (error: unknown) { handleReadError(error); }
}

/** AF-5: a relationship that is not (or no longer) the actor's ACTIVE caregiver relationship is a plain 404. */
export async function getFamilyHealthSummaryPageContext(relationshipId: unknown): Promise<FamilyHealthSummary> {
  try { return await getFamilyHealthSummary(await getFamilyWorkspaceActor(), relationshipId); }
  catch (error: unknown) { handleReadError(error); }
}
