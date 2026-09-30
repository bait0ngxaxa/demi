import "server-only";

import { notFound, redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { resolveOwnPatientContext } from "@/modules/patient-self/services/patient-self-query-service";
import type { PatientSelfContext } from "@/modules/patient-self/services/patient-self-query-service";
import { getOwnPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import type { PatientHospitalProfileDetail } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

export async function getPatientSelfPageContext(): Promise<PatientSelfContext | null> {
  let actor: ActorContext;

  try {
    actor = await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      redirect("/login");
    }

    throw error;
  }

  try {
    return await resolveOwnPatientContext(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

export async function getPatientSelfHospitalProfilePageContext(
  relationshipId: string,
): Promise<PatientHospitalProfileDetail> {
  let actor: ActorContext;

  try {
    actor = await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  try {
    return await getOwnPatientHospitalProfile(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }
}
