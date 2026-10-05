import "server-only";

import { HospitalStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { resolveOwnPatientContext } from "@/modules/patient-self/services/patient-self-query-service";
import type { PatientSelfContext } from "@/modules/patient-self/services/patient-self-query-service";
import { getOwnPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import type { PatientHospitalProfileDetail } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import {
  listOwnPatientHospitalContacts,
} from "@/modules/hospital-contact/services/hospital-contact-service";
import type { PatientHospitalContactProjection } from "@/modules/hospital-contact/types/hospital-contact-projections";

export type PatientSelfContactAvailability =
  | { status: "AVAILABLE"; contact: PatientHospitalContactProjection }
  | { status: "UNAVAILABLE" };

export type PatientPersonalHomePageContext = Omit<PatientSelfContext, "hospitalRelationships"> & {
  hospitalRelationships: Array<
    PatientSelfContext["hospitalRelationships"][number] & {
      hospitalContact: PatientSelfContactAvailability;
    }
  >;
};

async function getPatientActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      redirect("/login");
    }

    throw error;
  }
}

async function resolvePatientContext(actor: ActorContext): Promise<PatientSelfContext | null> {
  try {
    return await resolveOwnPatientContext(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

export async function getPatientSelfPageContext(): Promise<PatientSelfContext | null> {
  const actor = await getPatientActor();
  return resolvePatientContext(actor);
}

export async function getPatientPersonalHomePageContext(): Promise<PatientPersonalHomePageContext | null> {
  const actor = await getPatientActor();

  try {
    const patient = await resolveOwnPatientContext(actor);

    if (!patient) {
      return null;
    }

    const contacts = await listOwnPatientHospitalContacts(actor);

    const contactByRelationshipId = new Map(contacts.map((contact) => [contact.relationshipId, contact]));

    return {
      ...patient,
      hospitalRelationships: patient.hospitalRelationships.map((relationship) => {
        const contact = contactByRelationshipId.get(relationship.relationshipId);

        return {
          ...relationship,
          hospitalContact:
            relationship.hospitalStatus === HospitalStatus.ACTIVE && contact?.availability === "AVAILABLE"
              ? { status: "AVAILABLE", contact: contact.contact }
              : { status: "UNAVAILABLE" },
        };
      }),
    };
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
