import "server-only";

import { Prisma, Role, UserStatus, type HospitalStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { PATIENT_READ_CAPABILITY } from "@/modules/patient-directory/policies/patient-directory-policy";
import { assertPatientSelfReadPolicy } from "@/modules/patient-self/policies/patient-self-policy";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

export type PatientSelfQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientSelfContext = {
  person: {
    givenName: string | null;
    familyName: string | null;
  };
  profile: {
    phoneNumber: string | null;
    addressText: string | null;
  };
  hospitalRelationships: Array<{
    hospitalCode: string;
    hospitalName: string;
    hospitalNumber: string | null;
    hospitalStatus: HospitalStatus;
  }>;
};

export type PatientSelfQueryDependencies = {
  database?: PatientSelfQueryDatabase;
};

export const patientSelfContextSelect = {
  givenName: true,
  familyName: true,
  patientProfile: {
    select: {
      phoneNumber: true,
      addressText: true,
      hospitalRelationships: {
        orderBy: [{ hospital: { name: "asc" } }, { id: "asc" }],
        select: {
          hospitalNumber: true,
          hospital: {
            select: {
              hospitalCode: true,
              name: true,
              status: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PersonSelect;

type PatientSelfContextRecord = Prisma.PersonGetPayload<{
  select: typeof patientSelfContextSelect;
}>;

function getDatabase(database?: PatientSelfQueryDatabase): PatientSelfQueryDatabase {
  return database ?? getPrisma();
}

function toPatientSelfContext(record: PatientSelfContextRecord): PatientSelfContext | null {
  const profile = record.patientProfile;

  if (!profile) {
    return null;
  }

  return {
    person: {
      givenName: record.givenName,
      familyName: record.familyName,
    },
    profile: {
      phoneNumber: profile.phoneNumber,
      addressText: profile.addressText,
    },
    hospitalRelationships: profile.hospitalRelationships.map((relationship) => ({
      hospitalCode: relationship.hospital.hospitalCode,
      hospitalName: relationship.hospital.name,
      hospitalNumber: relationship.hospitalNumber,
      hospitalStatus: relationship.hospital.status,
    })),
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
      where: {
        id: actor.personId,
        user: {
          is: {
            id: actor.userId,
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.PATIENT } },
          },
        },
      },
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
