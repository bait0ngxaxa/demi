import "server-only";

import { Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  applyPatientHospitalProfilePatch,
  PATIENT_HOSPITAL_PROFILE_FIELDS,
  resolveEffectivePatientHospitalProfile,
  type PatientHospitalProfilePatch,
  type PatientHospitalProfileValues,
} from "../domain/patient-hospital-profile-values";
import {
  assertPatientHospitalProfileUpdatePolicy,
  PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY,
} from "../policies/patient-hospital-profile-policy";
import {
  patientHospitalProfileRelationshipIdSchema,
  patientHospitalProfileUpdateSchema,
} from "../schemas/patient-hospital-profile-schemas";

export type PatientHospitalProfileDatabase = PrismaClient;

export type PatientHospitalProfileDetail = {
  relationshipId: string;
  hospitalName: string;
  person: {
    givenName: string | null;
    familyName: string | null;
  };
  profile: PatientHospitalProfileValues;
  source: "HOSPITAL_LOCAL" | "LEGACY_FALLBACK";
  version: number;
};

export const patientHospitalProfileSelect = {
  id: true,
  hospital: { select: { name: true } },
  hospitalProfile: {
    select: {
      gender: true,
      phoneNumber: true,
      addressText: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      occupation: true,
      educationLevel: true,
      version: true,
    },
  },
  patientProfile: {
    select: {
      gender: true,
      phoneNumber: true,
      addressText: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      occupation: true,
      educationLevel: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

type PatientHospitalProfileRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: typeof patientHospitalProfileSelect;
}>;

function toProfileValues(input: {
  gender: string | null;
  phoneNumber: string | null;
  addressText: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  occupation: string | null;
  educationLevel: string | null;
}): PatientHospitalProfileValues {
  return {
    gender: input.gender,
    phoneNumber: input.phoneNumber,
    addressText: input.addressText,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    occupation: input.occupation,
    educationLevel: input.educationLevel,
  };
}

function toDetail(record: PatientHospitalProfileRecord): PatientHospitalProfileDetail {
  const effective = resolveEffectivePatientHospitalProfile({
    legacy: toProfileValues(record.patientProfile),
    local: record.hospitalProfile
      ? {
          ...toProfileValues(record.hospitalProfile),
          version: record.hospitalProfile.version,
        }
      : null,
  });

  return {
    relationshipId: record.id,
    hospitalName: record.hospital.name,
    person: {
      givenName: record.patientProfile.person.givenName,
      familyName: record.patientProfile.person.familyName,
    },
    profile: effective.values,
    source: effective.source,
    version: effective.version,
  };
}

function ownRelationshipWhere(
  actor: ActorContext,
  relationshipId: string,
): Prisma.PatientHospitalRelationshipWhereInput {
  return {
    id: relationshipId,
    patientProfile: {
      is: {
        personId: actor.personId,
        person: {
          is: {
            user: {
              is: {
                id: actor.userId,
                status: UserStatus.ACTIVE,
                roles: { some: { role: Role.PATIENT } },
              },
            },
          },
        },
      },
    },
  };
}

export async function getOwnPatientHospitalProfile(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  database: PatientHospitalProfileDatabase = getPrisma(),
): Promise<PatientHospitalProfileDetail> {
  if (!actor?.roles.includes(Role.PATIENT) || !actor.userId.trim() || !actor.personId.trim()) {
    throw new ForbiddenError();
  }

  const parsedRelationshipId = patientHospitalProfileRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  try {
    const relationship = await database.patientHospitalRelationship.findFirst({
      where: ownRelationshipWhere(actor, parsedRelationshipId.data.toLowerCase()),
      select: patientHospitalProfileSelect,
    });

    if (!relationship) {
      throw new NotFoundError();
    }

    return toDetail(relationship);
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient profile could not be loaded");
  }
}

function toPatch(input: ReturnType<typeof patientHospitalProfileUpdateSchema.parse>): PatientHospitalProfilePatch {
  return {
    gender: input.gender,
    phoneNumber: input.phoneNumber,
    addressText: input.addressText,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    occupation: input.occupation,
    educationLevel: input.educationLevel,
  };
}

function toUpdateManyData(
  patch: PatientHospitalProfilePatch,
): Prisma.PatientHospitalProfileUpdateManyMutationInput {
  const data: Prisma.PatientHospitalProfileUpdateManyMutationInput = {
    version: { increment: 1 },
  };

  for (const field of PATIENT_HOSPITAL_PROFILE_FIELDS) {
    const value = patch[field];

    if (value !== undefined) {
      data[field] = value;
    }
  }

  return data;
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function updateOwnPatientHospitalProfile(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  input: unknown,
  database: PatientHospitalProfileDatabase = getPrisma(),
): Promise<{ version: number }> {
  if (!actor) {
    throw new ForbiddenError();
  }

  assertPatientHospitalProfileUpdatePolicy({
    actor,
    capability: PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY,
  });

  const parsedRelationshipId = patientHospitalProfileRelationshipIdSchema.safeParse(relationshipId);
  const parsedInput = patientHospitalProfileUpdateSchema.safeParse(input);

  if (!parsedRelationshipId.success || !parsedInput.success) {
    throw new ValidationError("Patient profile update data is invalid");
  }

  const normalizedRelationshipId = parsedRelationshipId.data.toLowerCase();
  const patch = toPatch(parsedInput.data);

  try {
    return await database.$transaction(
      async (transaction) => {
        const relationship = await transaction.patientHospitalRelationship.findFirst({
          where: ownRelationshipWhere(actor, normalizedRelationshipId),
          select: {
            id: true,
            hospitalProfile: {
              select: {
                gender: true,
                phoneNumber: true,
                addressText: true,
                emergencyContactName: true,
                emergencyContactPhone: true,
                occupation: true,
                educationLevel: true,
                version: true,
              },
            },
            patientProfile: {
              select: {
                gender: true,
                phoneNumber: true,
                addressText: true,
                emergencyContactName: true,
                emergencyContactPhone: true,
                occupation: true,
                educationLevel: true,
              },
            },
          },
        });

        if (!relationship) {
          throw new NotFoundError();
        }

        const expectedVersion = parsedInput.data.expectedVersion;

        if (relationship.hospitalProfile) {
          if (relationship.hospitalProfile.version !== expectedVersion) {
            throw new ConflictError("Patient profile changed after it was loaded");
          }

          const updated = await transaction.patientHospitalProfile.updateMany({
            where: {
              patientHospitalRelationshipId: relationship.id,
              version: expectedVersion,
            },
            data: toUpdateManyData(patch),
          });

          if (updated.count !== 1) {
            throw new ConflictError("Patient profile changed after it was loaded");
          }

          return { version: expectedVersion + 1 };
        }

        if (expectedVersion !== 0) {
          throw new ConflictError("Patient profile changed after it was loaded");
        }

        const initialValues = applyPatientHospitalProfilePatch(
          toProfileValues(relationship.patientProfile),
          patch,
        );

        await transaction.patientHospitalProfile.create({
          data: {
            patientHospitalRelationshipId: relationship.id,
            ...initialValues,
            version: 1,
          },
        });

        return { version: 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    if (
      error instanceof ConflictError ||
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof ValidationError
    ) {
      throw error;
    }

    if (isPrismaCode(error, "P2002") || isPrismaCode(error, "P2034")) {
      throw new ConflictError("Patient profile changed after it was loaded");
    }

    throw new InfrastructureError("Patient profile could not be updated");
  }
}

export const patientHospitalProfileInternals = {
  ownRelationshipWhere,
  toDetail,
  toPatch,
  toProfileValues,
  toUpdateManyData,
};
