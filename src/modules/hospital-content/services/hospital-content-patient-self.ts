import "server-only";

import { HospitalStatus, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

export function hospitalContentPatientPersonWhere(actor: ActorContext): Prisma.PersonWhereInput {
  return {
    id: actor.personId,
    user: { is: {
      id: actor.userId,
      personId: actor.personId,
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.PATIENT } },
    } },
  };
}

export type HospitalContentPatientSelf = { patientProfileId: string; hasEligibleHospital: boolean };

export async function resolveHospitalContentPatientSelf(
  actor: ActorContext,
  database: PrismaClient,
): Promise<HospitalContentPatientSelf> {
  try {
    // Top-level Profile guarantees the exact current Profile and Person binding.
    const profile = await database.patientProfile.findFirst({
      where: { person: { is: hospitalContentPatientPersonWhere(actor) } },
      select: { id: true, hospitalRelationships: {
        where: { hospital: { is: { status: HospitalStatus.ACTIVE } } },
        take: 1,
        select: { id: true },
      } },
    });
    if (!profile) throw new ForbiddenError();
    return { patientProfileId: profile.id, hasEligibleHospital: profile.hospitalRelationships.length > 0 };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) throw error;
    throw new InfrastructureError("Patient Content authority could not be resolved");
  }
}
