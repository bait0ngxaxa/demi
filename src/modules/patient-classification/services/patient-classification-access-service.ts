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
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import {
  assertPatientClassificationPolicy,
  type PatientClassificationCapability,
  type PatientClassificationPolicyTarget,
} from "../policies/patient-classification-policy";
import { patientClassificationRelationshipIdSchema } from "../schemas/patient-classification-schemas";

export type PatientClassificationAccessDatabase = PrismaClient | Prisma.TransactionClient;

export const patientClassificationRelationshipAccessSelect = {
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
      id: true,
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

export type PatientClassificationRelationshipAccessRecord =
  Prisma.PatientHospitalRelationshipGetPayload<{
    select: typeof patientClassificationRelationshipAccessSelect;
  }>;

export type PatientClassificationPatientSummary = {
  patientProfileId: string;
  patientHospitalRelationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  hospital: {
    id: string;
    name: string;
  };
};

export type PatientClassificationAccessContext = {
  patient: PatientClassificationPatientSummary;
  target: PatientClassificationPolicyTarget;
  actor: ActorContext;
};

function getDatabase(database?: PatientClassificationAccessDatabase): PatientClassificationAccessDatabase {
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

function hasPatientRole(record: PatientClassificationRelationshipAccessRecord): boolean {
  return Boolean(
    record.patientProfile.person.user?.roles.some(({ role }) => role === Role.PATIENT),
  );
}

async function loadAuthoritativeActor(
  database: PatientClassificationAccessDatabase,
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

export async function resolvePatientClassificationAccessContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  capability: PatientClassificationCapability,
  database?: PatientClassificationAccessDatabase,
): Promise<PatientClassificationAccessContext> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const parsedRelationshipId = patientClassificationRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  const db = getDatabase(database);
  const record = await db.patientHospitalRelationship.findUnique({
    where: { id: parsedRelationshipId.data.toLowerCase() },
    select: patientClassificationRelationshipAccessSelect,
  });

  if (!record || record.hospital.status !== HospitalStatus.ACTIVE || !hasPatientRole(record)) {
    throw new NotFoundError();
  }

  const authoritativeActor = await loadAuthoritativeActor(db, actor.userId, record.hospitalId);
  const target: PatientClassificationPolicyTarget = {
    hospitalId: record.hospitalId,
    hospitalStatus: record.hospital.status,
    assignedOsmUserId: record.osmAssignments[0]?.osmUserId ?? null,
    patientRelationshipExists: true,
  };

  assertPatientClassificationPolicy({
    actor: authoritativeActor,
    capability,
    target,
  });

  return {
    actor: authoritativeActor,
    patient: {
      patientProfileId: record.patientProfile.id,
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

export const patientClassificationAccessInternals = {
  hasPatientRole,
  loadAuthoritativeActor,
  toDisplayName,
};
