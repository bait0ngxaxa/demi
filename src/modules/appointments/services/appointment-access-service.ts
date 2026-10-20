import "server-only";

import {
  HospitalStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import type {
  ActorContext,
  ActorHospitalMembership,
  ActorOsmHospitalRelationship,
} from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";
import { assertDirectOrNetworkPatientRead } from "@/modules/hospital-service-areas/services/hospital-network-access";

import {
  APPOINTMENT_READ_CAPABILITY,
  appointmentPolicyInternals,
  decideAppointmentPolicy,
  type AppointmentCapability,
  type AppointmentPolicyTarget,
} from "../policies/appointment-policy";
import { appointmentRelationshipIdSchema } from "../schemas/appointment-schemas";

export type AppointmentAccessDatabase = PrismaClient | Prisma.TransactionClient;

export const appointmentRelationshipAccessSelect = {
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
              id: true,
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
    select: { id: true, osmUserId: true },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

export type AppointmentRelationshipAccessRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: typeof appointmentRelationshipAccessSelect;
}>;

export type AppointmentPatientSummary = {
  patientHospitalRelationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  hospital: {
    id: string;
    name: string;
  };
};

export type AppointmentAccessContext = {
  authoritativeActor: ActorContext;
  patient: AppointmentPatientSummary;
  target: AppointmentPolicyTarget;
  scopes: {
    patientSelf: boolean;
    exactOsmAssignment: boolean;
    directHospital: boolean;
    /** ADR-0016: read-only access through an active network Parent; never sufficient for any write. */
    networkRead: boolean;
  };
};

function getDatabase(database?: AppointmentAccessDatabase): AppointmentAccessDatabase {
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

function hasPatientRole(record: AppointmentRelationshipAccessRecord): boolean {
  return Boolean(
    record.patientProfile.person.user?.roles.some(({ role }) => role === Role.PATIENT),
  );
}

async function loadAuthoritativeActor(
  database: AppointmentAccessDatabase,
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

export async function resolveAppointmentAccessContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  capability: AppointmentCapability,
  database?: AppointmentAccessDatabase,
  createFields?: Pick<AppointmentPolicyTarget, "locationType" | "responsibleUserId">,
): Promise<AppointmentAccessContext> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const parsedRelationshipId = appointmentRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  const db = getDatabase(database);
  const record = await db.patientHospitalRelationship.findUnique({
    // Phase F: an ended relationship fails closed for every caller here (staff, OSM and Patient interactions);
    // the Patient's read-only history is served by the patient-self services.
    where: { id: parsedRelationshipId.data, ...activePatientHospitalRelationshipWhere },
    select: appointmentRelationshipAccessSelect,
  });

  if (
    !record ||
    record.hospital.status !== HospitalStatus.ACTIVE ||
    !hasPatientRole(record)
  ) {
    throw new NotFoundError();
  }

  const authoritativeActor = await loadAuthoritativeActor(db, actor.userId, record.hospitalId);
  const target: AppointmentPolicyTarget = {
    ...createFields,
    hospitalId: record.hospitalId,
    hospitalStatus: record.hospital.status,
    assignedOsmUserId: record.osmAssignments[0]?.osmUserId ?? null,
    assignedOsmAssignmentId: record.osmAssignments[0]?.id ?? null,
    patientUserId: record.patientProfile.person.user?.id ?? null,
  };

  const decision = decideAppointmentPolicy({
    actor: authoritativeActor,
    capability,
    target,
  });

  // ADR-0016: READ may fall back to an audited network read; every write path additionally
  // requires a direct scope or a manage capability, which a network reader never holds.
  const access = await assertDirectOrNetworkPatientRead(
    () => {
      if (!decision.allowed) throw new ForbiddenError();
    },
    capability === APPOINTMENT_READ_CAPABILITY,
    db,
    { actorUserId: actor.userId, childHospitalId: record.hospitalId, patientHospitalRelationshipId: record.id, scope: "appointment" },
  );

  return {
    authoritativeActor,
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
    scopes: {
      patientSelf: authoritativeActor.roles.includes(Role.PATIENT) &&
        authoritativeActor.userId === target.patientUserId,
      exactOsmAssignment: authoritativeActor.roles.includes(Role.OSM) &&
        appointmentPolicyInternals.hasExactActiveOsmAssignment(authoritativeActor, target),
      directHospital: authoritativeActor.roles.includes(Role.HOSPITAL) &&
        appointmentPolicyInternals.hasActiveDirectHospitalScope(authoritativeActor, target.hospitalId),
      networkRead: access === "NETWORK",
    },
  };
}

export const appointmentAccessInternals = {
  hasPatientRole,
  loadAuthoritativeActor,
  toDisplayName,
};

