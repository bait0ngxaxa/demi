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
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import {
  assertPatientEvidencePolicy,
  type PatientEvidenceCapability,
  type PatientEvidencePolicyTarget,
} from "../policies/patient-evidence-policy";
import { patientEvidenceRelationshipIdSchema } from "../schemas/patient-evidence-schemas";

export type PatientEvidenceAccessDatabase = PrismaClient | Prisma.TransactionClient;

export const patientEvidenceRelationshipAccessSelect = {
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

export type PatientEvidenceRelationshipAccessRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: typeof patientEvidenceRelationshipAccessSelect;
}>;

export type PatientEvidencePatientSummary = {
  patientHospitalRelationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  hospital: {
    id: string;
    name: string;
  };
};

export type PatientEvidenceAccessContext = {
  patient: PatientEvidencePatientSummary;
  target: PatientEvidencePolicyTarget;
  actor: ActorContext;
};

function getDatabase(database?: PatientEvidenceAccessDatabase): PatientEvidenceAccessDatabase {
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

function hasPatientRole(record: PatientEvidenceRelationshipAccessRecord): boolean {
  return Boolean(
    record.patientProfile.person.user?.roles.some(({ role }) => role === Role.PATIENT),
  );
}

function buildAuthorizedPatientEvidenceRelationshipWhere(
  actor: ActorContext,
  relationshipId: string,
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
    id: relationshipId,
    OR: accessPredicates,
  };
}

async function loadAuthoritativeActor(
  database: PatientEvidenceAccessDatabase,
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

export async function resolvePatientEvidenceAccessContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  capability: PatientEvidenceCapability,
  database?: PatientEvidenceAccessDatabase,
): Promise<PatientEvidenceAccessContext> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const parsedRelationshipId = patientEvidenceRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  try {
    const db = getDatabase(database);
    const record = await db.patientHospitalRelationship.findFirst({
      where: buildAuthorizedPatientEvidenceRelationshipWhere(
        actor,
        parsedRelationshipId.data.toLowerCase(),
      ),
      select: patientEvidenceRelationshipAccessSelect,
    });

    if (!record || record.hospital.status !== HospitalStatus.ACTIVE || !hasPatientRole(record)) {
      throw new NotFoundError();
    }

    const authoritativeActor = await loadAuthoritativeActor(db, actor.userId, record.hospitalId);
    const target: PatientEvidencePolicyTarget = {
      hospitalId: record.hospitalId,
      hospitalStatus: record.hospital.status,
      assignedOsmUserId: record.osmAssignments[0]?.osmUserId ?? null,
    };

    assertPatientEvidencePolicy({
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
  } catch (error: unknown) {
    if (
      error instanceof ForbiddenError ||
      error instanceof NotFoundError ||
      error instanceof InfrastructureError
    ) {
      throw error;
    }

    throw new InfrastructureError("Patient evidence access could not be resolved");
  }
}

export const patientEvidenceAccessInternals = {
  buildAuthorizedPatientEvidenceRelationshipWhere,
  hasPatientRole,
  loadAuthoritativeActor,
  toDisplayName,
};
