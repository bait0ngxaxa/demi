import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  assertPatientReadPolicy,
  PATIENT_READ_CAPABILITY,
} from "@/modules/patient-directory/policies/patient-directory-policy";
import {
  patientDirectoryQuerySchema,
  patientDirectoryRelationshipIdSchema,
  PATIENT_DIRECTORY_PAGE_SIZE,
  type PatientDirectoryLookupType,
  type PatientDirectoryQueryInput,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

export type PatientDirectoryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientDirectoryScope = {
  hospitalId: string;
  hospitalName: string;
};

export type PatientDirectoryItem = {
  patientProfileId: string;
  patientHospitalRelationshipId: string;
  displayName: string;
  hospital: {
    id: string;
    name: string;
  };
  hospitalNumber: string | null;
};

export type PatientDirectoryPage = {
  hospital: PatientDirectoryScope;
  items: PatientDirectoryItem[];
  lookupType: PatientDirectoryLookupType;
  value: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type PatientDirectoryQueryDependencies = {
  database?: PatientDirectoryDatabase;
};

const patientDirectorySelect = {
  id: true,
  hospitalNumber: true,
  hospital: {
    select: {
      id: true,
      name: true,
    },
  },
  patientProfile: {
    select: {
      id: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

type PatientDirectoryRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: typeof patientDirectorySelect;
}>;

const patientDirectoryOrderBy = [
  { patientProfile: { person: { givenName: "asc" } } },
  { patientProfile: { person: { familyName: "asc" } } },
  { id: "asc" },
] satisfies Prisma.PatientHospitalRelationshipOrderByWithRelationInput[];

function getDatabase(database?: PatientDirectoryDatabase): PatientDirectoryDatabase {
  return database ?? getPrisma();
}

function parseDirectoryQuery(input: unknown): PatientDirectoryQueryInput {
  const parsed = patientDirectoryQuerySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient directory query data is invalid");
  }

  return parsed.data;
}

function assertHospitalActor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.roles.includes(Role.HOSPITAL)) {
    throw new ForbiddenError();
  }
}

function buildAuthorizedHospitalWhere(actorUserId: string): Prisma.HospitalWhereInput {
  return {
    status: HospitalStatus.ACTIVE,
    memberships: {
      some: {
        userId: actorUserId,
        membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
    },
  };
}

function buildNameWhere(value: string): Prisma.PersonWhereInput {
  const terms = value.split(/\s+/u).filter(Boolean);

  return {
    AND: terms.map((term) => ({
      OR: [
        { givenName: { contains: term, mode: "insensitive" } },
        { familyName: { contains: term, mode: "insensitive" } },
      ],
    })),
  };
}

function buildPatientRelationshipWhere(
  actorUserId: string,
  input: PatientDirectoryQueryInput,
): Prisma.PatientHospitalRelationshipWhereInput {
  const personWhere: Prisma.PersonWhereInput = {
    user: { roles: { some: { role: Role.PATIENT } } },
    ...(input.lookupType === "NAME" && input.value ? buildNameWhere(input.value) : {}),
  };

  return {
    hospitalId: input.targetHospitalId,
    hospital: buildAuthorizedHospitalWhere(actorUserId),
    patientProfile: { person: personWhere },
    ...(input.lookupType === "HOSPITAL_NUMBER" && input.value
      ? { hospitalNumber: input.value }
      : {}),
  };
}

function toDisplayName(person: PatientDirectoryRecord["patientProfile"]["person"]): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ผู้ป่วย";
}

function toPatientDirectoryItem(record: PatientDirectoryRecord): PatientDirectoryItem {
  return {
    patientProfileId: record.patientProfile.id,
    patientHospitalRelationshipId: record.id,
    displayName: toDisplayName(record.patientProfile.person),
    hospital: record.hospital,
    hospitalNumber: record.hospitalNumber,
  };
}

async function resolveAuthorizedHospital(
  database: PatientDirectoryDatabase,
  actorUserId: string,
  hospitalId: string,
): Promise<PatientDirectoryScope> {
  const hospital = await database.hospital.findFirst({
    where: {
      id: hospitalId,
      ...buildAuthorizedHospitalWhere(actorUserId),
    },
    select: { id: true, name: true },
  });

  if (!hospital) {
    throw new ForbiddenError();
  }

  return {
    hospitalId: hospital.id,
    hospitalName: hospital.name,
  };
}

export async function listPatientDirectoryScopes(
  actor: ActorContext | null | undefined,
  dependencies: PatientDirectoryQueryDependencies = {},
): Promise<PatientDirectoryScope[]> {
  assertHospitalActor(actor);

  try {
    const scopes = await getDatabase(dependencies.database).hospital.findMany({
      where: buildAuthorizedHospitalWhere(actor.userId),
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return scopes.map((scope) => ({
      hospitalId: scope.id,
      hospitalName: scope.name,
    }));
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient directory Hospitals could not be loaded");
  }
}

export async function findPatientDirectory(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientDirectoryQueryDependencies = {},
): Promise<PatientDirectoryPage> {
  const parsed = parseDirectoryQuery(input);
  assertPatientReadPolicy({
    actor,
    capability: PATIENT_READ_CAPABILITY,
    targetHospitalId: parsed.targetHospitalId,
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies.database);
    const hospital = await resolveAuthorizedHospital(
      database,
      actor.userId,
      parsed.targetHospitalId,
    );
    const where = buildPatientRelationshipWhere(actor.userId, parsed);
    const total = await database.patientHospitalRelationship.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / PATIENT_DIRECTORY_PAGE_SIZE));
    const page = Math.min(parsed.page, totalPages);
    const relationships = await database.patientHospitalRelationship.findMany({
      where,
      orderBy: patientDirectoryOrderBy,
      skip: (page - 1) * PATIENT_DIRECTORY_PAGE_SIZE,
      take: PATIENT_DIRECTORY_PAGE_SIZE,
      select: patientDirectorySelect,
    });

    return {
      hospital,
      items: relationships.map(toPatientDirectoryItem),
      lookupType: parsed.lookupType,
      value: parsed.value ?? "",
      page,
      pageSize: PATIENT_DIRECTORY_PAGE_SIZE,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ValidationError) {
      throw error;
    }

    throw new InfrastructureError("Patient directory could not be loaded");
  }
}

export async function getPatientDirectoryDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientDirectoryQueryDependencies = {},
): Promise<PatientDirectoryItem> {
  assertHospitalActor(actor);

  const parsedRelationshipId = patientDirectoryRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  try {
    const relationship = await getDatabase(dependencies.database).patientHospitalRelationship.findFirst({
      where: {
        id: parsedRelationshipId.data,
        hospital: buildAuthorizedHospitalWhere(actor.userId),
        patientProfile: {
          person: {
            user: { roles: { some: { role: Role.PATIENT } } },
          },
        },
      },
      select: patientDirectorySelect,
    });

    if (!relationship) {
      throw new NotFoundError();
    }

    return toPatientDirectoryItem(relationship);
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient detail could not be loaded");
  }
}

export const patientDirectoryInternals = {
  buildAuthorizedHospitalWhere,
  buildNameWhere,
  buildPatientRelationshipWhere,
  patientDirectoryOrderBy,
  patientDirectorySelect,
  parseDirectoryQuery,
  toPatientDirectoryItem,
};
