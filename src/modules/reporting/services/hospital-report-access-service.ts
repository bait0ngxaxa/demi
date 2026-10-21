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

import {
  HOSPITAL_REPORT_CAPABILITIES,
  decideHospitalReportPolicy,
  type HospitalReportCapability,
} from "../policies/hospital-report-policy";
import { hospitalReportHospitalIdSchema, type HospitalReportCohort } from "../schemas/hospital-report-schemas";

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
  accessBasis: "OWNER" | "MEMBER";
};

function getDatabase(database?: HospitalReportAccessDatabase): HospitalReportAccessDatabase {
  return database ?? getPrisma();
}

function validateActor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor) {
    throw new ForbiddenError();
  }
}

export async function listHospitalReportingHospitals(
  actor: ActorContext | null | undefined,
  database?: HospitalReportAccessDatabase,
): Promise<HospitalReportingHospital[]> {
  validateActor(actor);

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
  cohort: HospitalReportCohort = "ACTIVE",
): Promise<HospitalReportingAccessContext> {
  validateActor(actor);

  const parsedHospitalId = hospitalReportHospitalIdSchema.safeParse(hospitalId);
  if (!parsedHospitalId.success) throw new NotFoundError();

  try {
    const db = getDatabase(database);
    // Rebuild authority from the persisted exact membership; historical export grants confer nothing extra.
    const membership = await db.hospitalMembership.findFirst({
      where: {
        userId: actor.userId,
        hospitalId: parsedHospitalId.data,
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
        membershipType: true,
        profession: true,
        reportExportGrantedAt: true,
        hospital: {
          select: { id: true, hospitalCode: true, name: true, status: true },
        },
      },
    });

    if (!membership) throw new NotFoundError();

    const authoritativeActor: ActorContext = {
      ...actor,
      hospitalMemberships: [{
        hospitalId: membership.hospital.id,
        membershipType: membership.membershipType,
        profession: membership.profession,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: membership.hospital.status,
        reportExportGranted: membership.reportExportGrantedAt !== null,
      }],
    };
    const decision = decideHospitalReportPolicy({
      actor: authoritativeActor,
      capability,
      cohort,
      target: {
        hospitalId: membership.hospital.id,
        hospitalStatus: membership.hospital.status,
      },
    });

    if (!decision.allowed) {
      // MEMBER dashboard/row reads stay hidden; a MEMBER INCLUDE_ENDED export is a 403.
      if (membership.membershipType === MembershipType.MEMBER && capability !== HOSPITAL_REPORT_CAPABILITIES.export) {
        throw new NotFoundError();
      }
      throw new ForbiddenError();
    }

    return {
      actor,
      hospital: membership.hospital,
      accessBasis: decision.reason === "active_direct_hospital_owner" ? "OWNER" : "MEMBER",
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) throw error;
    throw new InfrastructureError("Hospital reporting access could not be verified");
  }
}

/** Hospitals where the actor is an ACTIVE MEMBER, which may export without an OWNER grant. */
export async function listHospitalReportMemberExportHospitals(
  actor: ActorContext | null | undefined,
  database?: HospitalReportAccessDatabase,
): Promise<HospitalReportingHospital[]> {
  validateActor(actor);

  if (!actor.roles.includes(Role.HOSPITAL)) {
    return [];
  }

  try {
    const memberships = await getDatabase(database).hospitalMembership.findMany({
      where: {
        userId: actor.userId,
        membershipType: MembershipType.MEMBER,
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
  } catch {
    throw new InfrastructureError("Hospital report export access could not be loaded");
  }
}

export const hospitalReportAccessInternals = {
  validateActor,
  getDatabase,
};
