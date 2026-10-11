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
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import { isReportingAvailableInCurrentDeployment } from "./reporting-deployment-boundary";
import {
  assertHospitalReportPolicy,
  type HospitalReportCapability,
} from "../policies/hospital-report-policy";
import { hospitalReportHospitalIdSchema } from "../schemas/hospital-report-schemas";

export type HospitalReportAccessDatabase = PrismaClient | Prisma.TransactionClient;

export type HospitalReportingHospital = {
  id: string;
  hospitalCode: string;
  name: string;
  status: HospitalStatus;
};

export type HospitalReportingAccessContext = {
  actor: ActorContext;
  hospital: HospitalReportingHospital;
};

function getDatabase(database?: HospitalReportAccessDatabase): HospitalReportAccessDatabase {
  return database ?? getPrisma();
}

function validateActorAndDeployment(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!isReportingAvailableInCurrentDeployment()) {
    throw new NotFoundError();
  }
  if (!actor) {
    throw new ForbiddenError();
  }
}

export async function listHospitalReportingHospitals(
  actor: ActorContext | null | undefined,
  database?: HospitalReportAccessDatabase,
): Promise<HospitalReportingHospital[]> {
  validateActorAndDeployment(actor);

  if (!actor.roles.includes(Role.HOSPITAL)) {
    return [];
  }

  try {
    const db = getDatabase(database);
    const memberships = await db.hospitalMembership.findMany({
      where: {
        userId: actor.userId,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        user: {
          is: {
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.HOSPITAL } },
          },
        },
        hospital: { is: { status: HospitalStatus.ACTIVE } },
      },
      orderBy: [{ hospital: { name: "asc" } }, { hospitalId: "asc" }],
      select: {
        hospital: {
          select: { id: true, hospitalCode: true, name: true, status: true },
        },
      },
    });

    return memberships.map(({ hospital }) => hospital);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) throw error;
    throw new InfrastructureError("Hospital reporting access could not be loaded");
  }
}

export async function resolveHospitalReportingAccessContext(
  actor: ActorContext | null | undefined,
  hospitalId: unknown,
  capability: HospitalReportCapability,
  database?: HospitalReportAccessDatabase,
): Promise<HospitalReportingAccessContext> {
  validateActorAndDeployment(actor);

  const parsedHospitalId = hospitalReportHospitalIdSchema.safeParse(hospitalId);
  if (!parsedHospitalId.success) throw new NotFoundError();

  try {
    const db = getDatabase(database);
    const membership = await db.hospitalMembership.findFirst({
      where: {
        userId: actor.userId,
        hospitalId: parsedHospitalId.data,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        user: {
          is: {
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.HOSPITAL } },
          },
        },
        hospital: { is: { status: HospitalStatus.ACTIVE } },
      },
      select: {
        hospital: {
          select: { id: true, hospitalCode: true, name: true, status: true },
        },
      },
    });

    if (!membership) throw new NotFoundError();

    assertHospitalReportPolicy({
      actor,
      capability,
      target: {
        hospitalId: membership.hospital.id,
        hospitalStatus: membership.hospital.status,
      },
    });

    return { actor, hospital: membership.hospital };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) throw error;
    throw new InfrastructureError("Hospital reporting access could not be verified");
  }
}

export const hospitalReportAccessInternals = {
  validateActorAndDeployment,
  getDatabase,
};
