import "server-only";

import { notFound, redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import {
  listEligibleHospitalContactOwnerHospitals,
  readHospitalContactForOwner,
  type HospitalContactEditorProjection,
  type HospitalContactOwnerHospital,
} from "../services/hospital-contact-service";
import { hospitalContactHospitalIdSchema } from "../schemas/hospital-contact-schemas";

export type HospitalContactPageContext = {
  hospitals: HospitalContactOwnerHospital[];
  selectedHospitalId: string;
  contact: HospitalContactEditorProjection;
};

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

export async function getHospitalContactPageContext(
  requestedHospitalId: string | undefined,
): Promise<HospitalContactPageContext> {
  const actor = await resolveActor();
  let normalizedRequestedHospitalId: string | undefined;

  if (requestedHospitalId !== undefined) {
    const parsedHospitalId = hospitalContactHospitalIdSchema.safeParse(requestedHospitalId);

    if (!parsedHospitalId.success) {
      notFound();
    }

    normalizedRequestedHospitalId = parsedHospitalId.data;
  }

  let hospitals: HospitalContactOwnerHospital[];

  try {
    hospitals = await listEligibleHospitalContactOwnerHospitals(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      if (normalizedRequestedHospitalId !== undefined) {
        notFound();
      }

      redirect("/app");
    }

    throw error;
  }

  if (hospitals.length === 0) {
    if (normalizedRequestedHospitalId !== undefined) {
      notFound();
    }

    redirect("/app");
  }

  const selectedHospitalId = normalizedRequestedHospitalId ?? hospitals[0]?.id;

  if (!selectedHospitalId || !hospitals.some(({ id }) => id === selectedHospitalId)) {
    notFound();
  }

  try {
    const contact = await readHospitalContactForOwner(actor, selectedHospitalId);
    return { hospitals, selectedHospitalId, contact };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }
}
