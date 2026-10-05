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
      select: { id: true },
    });
    if (!profile) throw new ForbiddenError();
    // This statement re-proves SELF rather than trusting the earlier Profile read.
    const relationship = await database.patientHospitalRelationship.findFirst({
      where: {
        patientProfileId: profile.id,
        patientProfile: { is: {
          id: profile.id,
          person: { is: hospitalContentPatientPersonWhere(actor) },
        } },
        hospital: { is: { status: HospitalStatus.ACTIVE } },
      },
      select: { id: true },
    });
    if (relationship) return { patientProfileId: profile.id, hasEligibleHospital: true };
    // No relationship can also mean SELF was revoked before the relationship SELECT.
    const recheckedProfile = await database.patientProfile.findFirst({
      where: { person: { is: hospitalContentPatientPersonWhere(actor) } },
      select: { id: true },
    });
    if (!recheckedProfile) throw new ForbiddenError();
    return { patientProfileId: recheckedProfile.id, hasEligibleHospital: false };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) throw error;
    throw new InfrastructureError("Patient Content authority could not be resolved");
  }
}
