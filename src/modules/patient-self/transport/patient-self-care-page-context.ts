import "server-only";

import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { LoginReturnTo } from "@/modules/auth/schemas/login-schema";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  listDelegatedAppointments,
  listDelegatedAppointmentSubjects,
  type DelegatedAppointmentPage,
  type DelegatedAppointmentSubject,
} from "@/modules/family/services/delegated-appointment-query-service";
import { FAMILY_APPOINTMENT_READ_CONTRACT_V2 } from "@/modules/family/domain/appointment-grant-contract";
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
  getOwnPatientProgramRounds,
  listOwnPatientAppointmentHub,
  type PatientSelfAppointmentHub,
  type PatientSelfAppointmentHubTab,
  type PatientSelfCareJourneyPageRequests,
  type PatientSelfProgramDetailPageRequests,
} from "../services/patient-self-care-query-service";
import {
  listOwnPatientRelationshipNavigation,
} from "../services/patient-self-query-service";
import { PATIENT_ACCESS_UNAVAILABLE, type PatientAccessUnavailable } from "./patient-access-unavailable";

async function resolveActor(returnTo?: LoginReturnTo): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect(buildLoginReturnHref(returnTo));
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

async function withPatientSelfPageContext<T, D = never>(
  load: (actor: ActorContext) => Promise<T>,
  returnTo?: LoginReturnTo,
  denied?: D,
): Promise<T | D> {
  const actor = await resolveActor(returnTo);

  try {
    return await load(actor);
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect(buildLoginReturnHref(returnTo));
    }

    if (error instanceof ForbiddenError) {
      if (denied !== undefined) return denied;
      redirect("/app");
    }

    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }
}

/** Rich Menu entry: a denied SELF read renders an explanatory state instead of redirecting. */
export async function getPatientSelfRelationshipNavigationPageContext(
  returnTo?: LoginReturnTo,
): Promise<
  Awaited<ReturnType<typeof listOwnPatientRelationshipNavigation>> | PatientAccessUnavailable
> {
  return withPatientSelfPageContext(
    (actor) => listOwnPatientRelationshipNavigation(actor),
    returnTo,
    PATIENT_ACCESS_UNAVAILABLE,
  );
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

export async function getPatientSelfProgramRoundsPageContext(
  relationshipId: string,
  programId: string,
): Promise<Awaited<ReturnType<typeof getOwnPatientProgramRounds>>> {
  return withPatientSelfPageContext((actor) =>
    getOwnPatientProgramRounds(actor, relationshipId, programId),
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

export type PersonalAppointmentHubSubject =
  | { kind: "SELF"; key: "me" }
  | ({ kind: "FAMILY"; key: string } & DelegatedAppointmentSubject);

export type PersonalAppointmentHubPageContext = {
  subjects: PersonalAppointmentHubSubject[];
  selected: PersonalAppointmentHubSubject | null;
  tab: PatientSelfAppointmentHubTab;
  self: PatientSelfAppointmentHub | null;
  /**
   * A family member's list: upcoming always, history only under a v2 grant (AF-5); UNAVAILABLE when the grant
   * stopped authorizing between reads.
   */
  family: DelegatedAppointmentPage | "UNAVAILABLE" | null;
};

const hubLocatorSchema = z.string().uuid().transform((value) => value.toLowerCase());

async function loadFamilyAppointments(
  actor: ActorContext,
  grantId: string,
  tab: PatientSelfAppointmentHubTab,
  cursor: string | undefined,
): Promise<DelegatedAppointmentPage | "UNAVAILABLE"> {
  for (const input of cursor ? [{ grantId, tab, cursor }, { grantId, tab }] : [{ grantId, tab }]) {
    try {
      return await listDelegatedAppointments(actor, input);
    } catch (error: unknown) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }

  return "UNAVAILABLE";
}

/**
 * AF-4 hub: "ฉัน" exists only for a PATIENT with at least one own relationship; every other entry is a currently
 * ACTIVE appointment grant held by the actor. Query values select among server-built entries; anything else falls
 * back to the default. Each list is reauthorized by its own service on every request.
 */
export async function getPersonalAppointmentHubPageContext(
  search: Record<string, string | string[] | undefined>,
  returnTo?: LoginReturnTo,
): Promise<PersonalAppointmentHubPageContext | PatientAccessUnavailable> {
  const value = (key: string): string | undefined => {
    const entry = search[key];
    return typeof entry === "string" ? entry : undefined;
  };
  const tab: PatientSelfAppointmentHubTab = value("tab") === "history" ? "history" : "upcoming";

  return withPatientSelfPageContext(async (actor) => {
    const isPatient = actor.roles.includes(Role.PATIENT);
    const [ownRelationships, familySubjects] = await Promise.all([
      isPatient ? listOwnPatientRelationshipNavigation(actor) : Promise.resolve([]),
      listDelegatedAppointmentSubjects(actor),
    ]);
    const subjects: PersonalAppointmentHubSubject[] = [
      ...(isPatient && ownRelationships.length > 0 ? [{ kind: "SELF", key: "me" } as const] : []),
      ...familySubjects.map((subject) => ({ kind: "FAMILY", key: subject.grantId, ...subject }) as const),
    ];

    if (!isPatient && subjects.length === 0) {
      return PATIENT_ACCESS_UNAVAILABLE;
    }

    const requested = value("subject")?.toLowerCase();
    const selected = subjects.find(({ key }) => key === requested) ?? subjects[0] ?? null;
    const cursor = hubLocatorSchema.safeParse(value("cursor"));

    return {
      subjects,
      selected,
      tab,
      self: selected?.kind === "SELF"
        ? await listOwnPatientAppointmentHub(actor, { tab, hospital: value("hospital"), cursor: value("cursor") })
        : null,
      family: selected?.kind === "FAMILY" && (tab === "upcoming" || selected.contractVersion === FAMILY_APPOINTMENT_READ_CONTRACT_V2)
        ? await loadFamilyAppointments(actor, selected.grantId, tab, cursor.success ? cursor.data : undefined)
        : null,
    };
  }, returnTo, PATIENT_ACCESS_UNAVAILABLE);
}
