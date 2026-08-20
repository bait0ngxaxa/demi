import "server-only";

import {
  HospitalStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type {
  ActorContext,
  ActorHospitalMembership,
  ActorOsmHospitalRelationship,
} from "@/modules/auth/types/actor-context";
import {
  buildAuthorizedHospitalWhere,
  buildOsmAssignedPatientRelationshipWhere,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import {
  assertPatientProgramPolicy,
  type PatientProgramCapability,
  type PatientProgramPolicyTarget,
} from "../policies/patient-program-policy";
import {
  patientProgramIdSchema,
  patientProgramRelationshipIdSchema,
} from "../schemas/patient-program-schemas";

export type PatientProgramAccessDatabase = PrismaClient | Prisma.TransactionClient;

export const patientProgramRelationshipAccessSelect = {
  id: true,
  hospitalId: true,
  hospitalNumber: true,
  hospital: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  patientProfile: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
          user: {
            select: {
              roles: { select: { role: true } },
            },
          },
        },
      },
    },
  },
  osmAssignments: {
    where: { endedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { osmUserId: true },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

export type PatientProgramRelationshipAccessRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: typeof patientProgramRelationshipAccessSelect;
}>;

export type PatientProgramPatientSummary = {
  patientHospitalRelationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  hospital: {
    id: string;
    name: string;
  };
};

export type PatientProgramAccessContext = {
  patient: PatientProgramPatientSummary;
  target: PatientProgramPolicyTarget;
  actor: ActorContext;
};

function getDatabase(database?: PatientProgramAccessDatabase): PatientProgramAccessDatabase {
  return database ?? getPrisma();
}

function toDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ผู้ป่วย";
}

function hasPatientRole(record: PatientProgramRelationshipAccessRecord): boolean {
  return Boolean(
    record.patientProfile.person.user?.roles.some(({ role }) => role === Role.PATIENT),
  );
}

export function buildAuthorizedPatientProgramRelationshipWhere(
  actor: ActorContext,
  relationshipId?: string,
): Prisma.PatientHospitalRelationshipWhereInput {
  const accessPredicates: Prisma.PatientHospitalRelationshipWhereInput[] = [];
  const patientRoleWhere: Prisma.PatientHospitalRelationshipWhereInput = {
    patientProfile: {
      person: {
        user: { roles: { some: { role: Role.PATIENT } } },
      },
    },
  };

  if (actor.roles.includes(Role.HOSPITAL)) {
    accessPredicates.push({
      ...patientRoleWhere,
      hospital: buildAuthorizedHospitalWhere(actor.userId),
    });
  }

  if (actor.roles.includes(Role.OSM)) {
    accessPredicates.push(buildOsmAssignedPatientRelationshipWhere(actor.userId));
  }

  if (accessPredicates.length === 0) {
    throw new ForbiddenError();
  }

  return {
    ...(relationshipId ? { id: relationshipId } : {}),
    OR: accessPredicates,
  };
}

async function loadAuthoritativeActor(
  database: PatientProgramAccessDatabase,
  actorUserId: string,
  hospitalId: string,
): Promise<ActorContext> {
  const actor = await database.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      personId: true,
      status: true,
      roles: { select: { role: true } },
      memberships: {
        where: { hospitalId },
        select: {
          hospitalId: true,
          membershipType: true,
          profession: true,
          status: true,
          hospital: { select: { status: true } },
        },
      },
      osmHospitalRelationships: {
        where: { hospitalId },
        select: {
          hospitalId: true,
          status: true,
          hospital: { select: { status: true } },
        },
      },
    },
  });

  if (!actor || actor.status !== UserStatus.ACTIVE) {
    throw new ForbiddenError();
  }

  const hospitalMemberships: ActorHospitalMembership[] = actor.memberships.map((membership) => ({
    hospitalId: membership.hospitalId,
    membershipType: membership.membershipType,
    profession: membership.profession,
    status: membership.status,
    hospitalStatus: membership.hospital.status,
  }));
  const osmHospitalRelationships: ActorOsmHospitalRelationship[] =
    actor.osmHospitalRelationships.map((relationship) => ({
      hospitalId: relationship.hospitalId,
      status: relationship.status,
      hospitalStatus: relationship.hospital.status,
    }));

  return {
    userId: actor.id,
    personId: actor.personId,
    roles: actor.roles.map(({ role }) => role),
    hospitalMemberships,
    osmHospitalRelationships,
  };
}

export async function resolvePatientProgramAccessContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  capability: PatientProgramCapability,
  database?: PatientProgramAccessDatabase,
): Promise<PatientProgramAccessContext> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const parsedRelationshipId = patientProgramRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  const db = getDatabase(database);
  const normalizedRelationshipId = parsedRelationshipId.data.toLowerCase();
  const record = await db.patientHospitalRelationship.findFirst({
    where: buildAuthorizedPatientProgramRelationshipWhere(actor, normalizedRelationshipId),
    select: patientProgramRelationshipAccessSelect,
  });

  if (!record || record.hospital.status !== HospitalStatus.ACTIVE || !hasPatientRole(record)) {
    throw new NotFoundError();
  }

  const authoritativeActor = await loadAuthoritativeActor(db, actor.userId, record.hospitalId);
  const target: PatientProgramPolicyTarget = {
    hospitalId: record.hospitalId,
    hospitalStatus: record.hospital.status,
    assignedOsmUserId: record.osmAssignments[0]?.osmUserId ?? null,
  };

  assertPatientProgramPolicy({
    actor: authoritativeActor,
    capability,
    target,
  });

  return {
    actor: authoritativeActor,
    patient: {
      patientHospitalRelationshipId: record.id,
      displayName: toDisplayName(record.patientProfile.person),
      hospitalNumber: record.hospitalNumber,
      hospital: {
        id: record.hospital.id,
        name: record.hospital.name,
      },
    },
    target,
  };
}

export async function resolvePatientProgramByIdAccessContext(
  actor: ActorContext | null | undefined,
  programId: unknown,
  capability: PatientProgramCapability,
  database?: PatientProgramAccessDatabase,
): Promise<PatientProgramAccessContext> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const parsedProgramId = patientProgramIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new NotFoundError();
  }

  const db = getDatabase(database);
  const program = await db.patientProgram.findFirst({
    where: {
      id: parsedProgramId.data.toLowerCase(),
      patientHospitalRelationship: buildAuthorizedPatientProgramRelationshipWhere(actor),
    },
    select: { patientHospitalRelationshipId: true },
  });

  if (!program) {
    throw new NotFoundError();
  }

  return resolvePatientProgramAccessContext(
    actor,
    program.patientHospitalRelationshipId,
    capability,
    db,
  );
}

export const patientProgramAccessInternals = {
  buildAuthorizedPatientProgramRelationshipWhere,
  hasPatientRole,
  loadAuthoritativeActor,
  toDisplayName,
};
