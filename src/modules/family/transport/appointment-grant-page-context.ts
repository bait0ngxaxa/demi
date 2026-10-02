import "server-only";

import { notFound, redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import { getAppointmentGrantManagement, type AppointmentGrantManagement } from "../services/appointment-grant-management-query-service";
import { getFamilyManagementOverview, type FamilyManagementOverview } from "../services/caregiver-relationship-query-service";
import { getDelegatedAppointment, listDelegatedAppointments, type DelegatedAppointment, type DelegatedAppointmentPage } from "../services/delegated-appointment-query-service";

function handleReadError(error: unknown): never {
  if (error instanceof UnauthenticatedError) redirect("/login");
  if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
  throw error;
}

export async function getFamilyAppointmentWorkspacePageContext(relationshipInput: unknown, grantInput: unknown): Promise<{
  overview: FamilyManagementOverview; management: AppointmentGrantManagement | null;
}> {
  try {
    const actor = await getProtectedApplicationActor();
    const [overview, management] = await Promise.all([
      getFamilyManagementOverview(actor, relationshipInput), getAppointmentGrantManagement(actor, grantInput),
    ]);
    return { overview, management };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export async function getDelegatedAppointmentsPageContext(input: unknown): Promise<DelegatedAppointmentPage> {
  try { return await listDelegatedAppointments(await getProtectedApplicationActor(), input); }
  catch (error: unknown) { handleReadError(error); }
}

export async function getDelegatedAppointmentPageContext(grantId: unknown, appointmentId: unknown): Promise<DelegatedAppointment> {
  try { return await getDelegatedAppointment(await getProtectedApplicationActor(), grantId, appointmentId); }
  catch (error: unknown) { handleReadError(error); }
}
