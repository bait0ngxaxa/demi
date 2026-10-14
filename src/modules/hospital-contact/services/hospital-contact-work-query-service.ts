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
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import {
  assertHospitalContactPolicy,
  HOSPITAL_CONTACT_CAPABILITIES,
} from "../policies/hospital-contact-policy";
import type { HospitalWorkContactProjection } from "../types/hospital-contact-projections";

type Database = PrismaClient;

const hospitalWorkContactSelect = {
  hospitalCode: true,
  name: true,
  contact: { select: { addressText: true, phoneNumber: true } },
} satisfies Prisma.HospitalSelect;

type HospitalWorkContactRecord = Prisma.HospitalGetPayload<{
  select: typeof hospitalWorkContactSelect;
}>;

function activeWorkHospitalWhere(actor: ActorContext): Prisma.HospitalWhereInput {
  const scopes: Prisma.HospitalWhereInput[] = [];

  if (actor.roles.includes(Role.HOSPITAL)) {
    scopes.push({
      memberships: {
        some: {
          userId: actor.userId,
          membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
          status: MembershipStatus.ACTIVE,
          user: {
            id: actor.userId,
            personId: actor.personId,
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.HOSPITAL } },
          },
        },
      },
    });
  }

  if (actor.roles.includes(Role.OSM)) {
    scopes.push({
      osmHospitalRelationships: {
        some: {
          userId: actor.userId,
          status: MembershipStatus.ACTIVE,
          user: {
            id: actor.userId,
            personId: actor.personId,
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.OSM } },
          },
        },
      },
    });
  }

  return { status: HospitalStatus.ACTIVE, OR: scopes };
}

function assertWorkActor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || (!actor.roles.includes(Role.HOSPITAL) && !actor.roles.includes(Role.OSM))) {
    throw new ForbiddenError();
  }
}

function toWorkContactProjection(row: HospitalWorkContactRecord): HospitalWorkContactProjection {
  const addressText = row.contact?.addressText ?? null;
  const phoneNumber = row.contact?.phoneNumber ?? null;

  return {
    hospital: { hospitalCode: row.hospitalCode, name: row.name },
    availability: addressText || phoneNumber ? "AVAILABLE" : "UNAVAILABLE",
    addressText,
    phoneNumber,
  };
}

export async function listWorkHospitalContacts(
  actor: ActorContext | null | undefined,
  database: Database = getPrisma(),
): Promise<HospitalWorkContactProjection[]> {
  assertWorkActor(actor);
  assertHospitalContactPolicy({
    actor,
    capability: HOSPITAL_CONTACT_CAPABILITIES.read,
    scope: "WORK_HOSPITAL_RELATIONSHIP",
  });

  try {
    const activeUser = await database.user.findFirst({
      where: {
        id: actor.userId,
        personId: actor.personId,
        status: UserStatus.ACTIVE,
        roles: { some: { role: { in: actor.roles.filter((role) => role === Role.HOSPITAL || role === Role.OSM) } } },
      },
      select: { id: true },
    });

    if (!activeUser) {
      throw new ForbiddenError();
    }

    const hospitals = await database.hospital.findMany({
      where: activeWorkHospitalWhere(actor),
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
      select: hospitalWorkContactSelect,
    });

    return hospitals.map(toWorkContactProjection);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Hospital work contacts could not be loaded");
  }
}

export const hospitalContactWorkQueryInternals = {
  activeWorkHospitalWhere,
  assertWorkActor,
  hospitalWorkContactSelect,
  toWorkContactProjection,
};

export type { HospitalWorkContactProjection } from "../types/hospital-contact-projections";
