import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  Prisma,
  Role,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  accessBasisForMembershipType,
  hospitalOperatorMembershipWhere,
  type HospitalAccessBasis,
} from "@/modules/identity/services/hospital-authority";
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  decideHospitalReportPolicy,
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
  accessBasis: HospitalAccessBasis;
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
    // ADR-0026: every Hospital the actor operates (ACTIVE OWNER or MEMBER).
    const memberships = await db.hospitalMembership.findMany({
      where: hospitalOperatorMembershipWhere(actor.userId),
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
  validateActor(actor);

  const parsedHospitalId = hospitalReportHospitalIdSchema.safeParse(hospitalId);
  if (!parsedHospitalId.success) throw new NotFoundError();

  try {
    const db = getDatabase(database);
    // Rebuild authority from the persisted exact membership; historical export grants confer nothing extra.
    const membership = await db.hospitalMembership.findFirst({
      where: hospitalOperatorMembershipWhere(actor.userId, parsedHospitalId.data),
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
      target: {
        hospitalId: membership.hospital.id,
        hospitalStatus: membership.hospital.status,
      },
    });

    const accessBasis = accessBasisForMembershipType(membership.membershipType);
    if (!decision.allowed || accessBasis === null) throw new ForbiddenError();

    return { actor, hospital: membership.hospital, accessBasis };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) throw error;
    throw new InfrastructureError("Hospital reporting access could not be verified");
  }
}

export const hospitalReportAccessInternals = {
  validateActor,
  getDatabase,
};
