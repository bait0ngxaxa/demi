import "server-only";

import { Prisma, Role, UserStatus, type HospitalStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { PATIENT_READ_CAPABILITY } from "@/modules/patient-directory/policies/patient-directory-policy";
import { assertPatientSelfReadPolicy } from "@/modules/patient-self/policies/patient-self-policy";
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";
import { z } from "zod";

export type PatientSelfQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientSelfContext = {
  person: {
    givenName: string | null;
    familyName: string | null;
  };
  hospitalRelationships: PatientSelfRelationshipNavigation[];
};

export type PatientSelfQueryDependencies = {
  database?: PatientSelfQueryDatabase;
};

export type PatientSelfRelationshipNavigation = {
  relationshipId: string;
  hospitalCode: string;
  hospitalName: string;
  hospitalNumber: string | null;
  hospitalStatus: HospitalStatus;
};

/** Internal server context. The relationship ID is only a locator; ownership is rechecked per request. */
export type PatientSelfRelationshipContext = PatientSelfRelationshipNavigation;

const patientSelfRelationshipNavigationSelect = {
  id: true,
  hospitalNumber: true,
  hospital: {
    select: {
      hospitalCode: true,
      name: true,
      status: true,
    },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

export const patientSelfContextSelect = {
  givenName: true,
  familyName: true,
  patientProfile: {
    select: {
      hospitalRelationships: {
        orderBy: [{ hospital: { name: "asc" } }, { id: "asc" }],
        select: patientSelfRelationshipNavigationSelect,
      },
    },
  },
} satisfies Prisma.PersonSelect;

const patientSelfRelationshipListSelect = {
  givenName: true,
  familyName: true,
  patientProfile: {
    select: {
      hospitalRelationships: {
        orderBy: [{ hospital: { name: "asc" } }, { id: "asc" }],
        select: patientSelfRelationshipNavigationSelect,
      },
    },
  },
} satisfies Prisma.PersonSelect;

type PatientSelfRelationshipListRecord = Prisma.PersonGetPayload<{
  select: typeof patientSelfRelationshipListSelect;
}>;

type PatientSelfContextRecord = Prisma.PersonGetPayload<{
  select: typeof patientSelfContextSelect;
}>;

function getDatabase(database?: PatientSelfQueryDatabase): PatientSelfQueryDatabase {
  return database ?? getPrisma();
}

function toPatientSelfContext(record: PatientSelfContextRecord): PatientSelfContext | null {
  const patientProfile = record.patientProfile;

  if (!patientProfile) {
    return null;
  }

  return {
    person: {
      givenName: record.givenName,
      familyName: record.familyName,
    },
    hospitalRelationships: patientProfile.hospitalRelationships.map(toRelationshipNavigation),
  };
}

function toRelationshipNavigation(
  record: Prisma.PatientHospitalRelationshipGetPayload<{
    select: typeof patientSelfRelationshipNavigationSelect;
  }>,
): PatientSelfRelationshipNavigation {
  return {
    relationshipId: record.id,
    hospitalCode: record.hospital.hospitalCode,
    hospitalName: record.hospital.name,
    hospitalNumber: record.hospitalNumber,
    hospitalStatus: record.hospital.status,
  };
}

function isAuthenticatedPatientActor(
  actor: ActorContext | null | undefined,
): actor is ActorContext {
  return Boolean(
    actor?.roles.includes(Role.PATIENT) &&
      actor.userId.trim() &&
      actor.personId.trim(),
  );
}

function ownPatientWhere(actor: ActorContext): Prisma.PersonWhereInput {
  return {
    id: actor.personId,
    user: {
      is: {
        id: actor.userId,
        status: UserStatus.ACTIVE,
        roles: { some: { role: Role.PATIENT } },
      },
    },
  };
}

export async function resolveOwnPatientContext(
  actor: ActorContext | null | undefined,
  dependencies: PatientSelfQueryDependencies = {},
): Promise<PatientSelfContext | null> {
  assertPatientSelfReadPolicy({ actor, capability: PATIENT_READ_CAPABILITY });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const person = await getDatabase(dependencies.database).person.findFirst({
      where: ownPatientWhere(actor),
      select: patientSelfContextSelect,
    });

    return person ? toPatientSelfContext(person) : null;
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient self context could not be loaded");
  }
}

export async function listOwnPatientRelationshipNavigation(
  actor: ActorContext | null | undefined,
  dependencies: PatientSelfQueryDependencies = {},
): Promise<PatientSelfRelationshipNavigation[]> {
  assertPatientSelfReadPolicy({ actor, capability: PATIENT_READ_CAPABILITY });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const person: PatientSelfRelationshipListRecord | null = await getDatabase(
      dependencies.database,
    ).person.findFirst({
      where: ownPatientWhere(actor),
      select: patientSelfRelationshipListSelect,
    });

    return person?.patientProfile?.hospitalRelationships.map(toRelationshipNavigation) ?? [];
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient relationship navigation could not be loaded");
  }
}

export async function resolveOwnPatientRelationshipContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientSelfQueryDependencies = {},
): Promise<PatientSelfRelationshipContext> {
  if (!isAuthenticatedPatientActor(actor)) {
    throw new ForbiddenError();
  }

  const parsedRelationshipId = z.string().uuid().safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  try {
    const person = await getDatabase(dependencies.database).person.findFirst({
      where: ownPatientWhere(actor),
      select: {
        patientProfile: {
          select: {
            hospitalRelationships: {
              where: { id: parsedRelationshipId.data.toLowerCase() },
              select: patientSelfRelationshipNavigationSelect,
            },
          },
        },
      } satisfies Prisma.PersonSelect,
    });
    const relationship = person?.patientProfile?.hospitalRelationships[0];

    if (!relationship || relationship.id.toLowerCase() !== parsedRelationshipId.data.toLowerCase()) {
      throw new NotFoundError();
    }

    return toRelationshipNavigation(relationship);
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient relationship could not be resolved");
  }
}

export const patientSelfQueryInternals = {
  isAuthenticatedPatientActor,
  ownPatientWhere,
  patientSelfRelationshipListSelect,
  patientSelfRelationshipNavigationSelect,
  toRelationshipNavigation,
};
