import "server-only";

import { notFound, redirect } from "next/navigation";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import {
  getOwnPatientAppointmentDetail,
  getOwnPatientAppointmentHistory,
  getOwnPatientCareJourney,
  getOwnPatientFollowupDetail,
  getOwnPatientGoalPlanDetail,
  getOwnPatientProgramDetail,
  type PatientSelfCareJourneyPageRequests,
  type PatientSelfProgramDetailPageRequests,
} from "../services/patient-self-care-query-service";
import {
  listOwnPatientRelationshipNavigation,
} from "../services/patient-self-query-service";

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

async function withPatientSelfPageContext<T>(
  load: (actor: ActorContext) => Promise<T>,
): Promise<T> {
  const actor = await resolveActor();

  try {
    return await load(actor);
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }
}

export async function getPatientSelfRelationshipNavigationPageContext(): Promise<
  Awaited<ReturnType<typeof listOwnPatientRelationshipNavigation>>
> {
  return withPatientSelfPageContext((actor) => listOwnPatientRelationshipNavigation(actor));
}

export async function getPatientSelfCareJourneyPageContext(
  relationshipId: string,
  pageRequests: PatientSelfCareJourneyPageRequests = {},
): Promise<Awaited<ReturnType<typeof getOwnPatientCareJourney>>> {
  return withPatientSelfPageContext((actor) =>
    getOwnPatientCareJourney(actor, relationshipId, {}, pageRequests),
  );
}

export async function getPatientSelfProgramDetailPageContext(
  relationshipId: string,
  programId: string,
  pageRequests: PatientSelfProgramDetailPageRequests = {},
): Promise<Awaited<ReturnType<typeof getOwnPatientProgramDetail>>> {
  return withPatientSelfPageContext((actor) =>
    getOwnPatientProgramDetail(actor, relationshipId, programId, {}, pageRequests),
  );
}

export async function getPatientSelfGoalPlanDetailPageContext(
  relationshipId: string,
  goalPlanId: string,
): Promise<Awaited<ReturnType<typeof getOwnPatientGoalPlanDetail>>> {
  return withPatientSelfPageContext((actor) =>
    getOwnPatientGoalPlanDetail(actor, relationshipId, goalPlanId),
  );
}

export async function getPatientSelfFollowupDetailPageContext(
  relationshipId: string,
  followupId: string,
): Promise<Awaited<ReturnType<typeof getOwnPatientFollowupDetail>>> {
  return withPatientSelfPageContext((actor) =>
    getOwnPatientFollowupDetail(actor, relationshipId, followupId),
  );
}

export async function getPatientSelfAppointmentHistoryPageContext(
  relationshipId: string,
  requestedPage?: unknown,
): Promise<Awaited<ReturnType<typeof getOwnPatientAppointmentHistory>>> {
  return withPatientSelfPageContext((actor) =>
    getOwnPatientAppointmentHistory(actor, relationshipId, {}, requestedPage),
  );
}

export async function getPatientSelfAppointmentDetailPageContext(
  relationshipId: string,
  appointmentId: string,
): Promise<Awaited<ReturnType<typeof getOwnPatientAppointmentDetail>>> {
  return withPatientSelfPageContext((actor) =>
    getOwnPatientAppointmentDetail(actor, relationshipId, appointmentId),
  );
}
