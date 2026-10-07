import "server-only";

import { HospitalStatus, MembershipStatus, Role, UserStatus, type Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { resolveOwnPatientContext } from "@/modules/patient-self/services/patient-self-query-service";

import { normalizeEligibleLineRoles } from "../domain/line-projection";
import type { OperationalLineRole } from "../domain/line-types";

type Database = PrismaClient | Prisma.TransactionClient;

export async function resolveEligibleLineRoles(
  userId: string,
  database: Database = getPrisma(),
): Promise<readonly OperationalLineRole[]> {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      personId: true,
      status: true,
      roles: { select: { role: true } },
      memberships: {
        select: { status: true, hospital: { select: { status: true } } },
      },
      osmHospitalRelationships: {
        select: { status: true, hospital: { select: { status: true } } },
      },
    },
  });
  if (!user || user.status !== UserStatus.ACTIVE) return [];

  const roles = user.roles.map(({ role }) => role);
  const eligible: Role[] = [];
  if (
    roles.includes(Role.HOSPITAL) &&
    user.memberships.some((membership) => membership.status === MembershipStatus.ACTIVE && membership.hospital.status === HospitalStatus.ACTIVE)
  ) eligible.push(Role.HOSPITAL);
  if (
    roles.includes(Role.OSM) &&
    user.osmHospitalRelationships.some((relationship) => relationship.status === MembershipStatus.ACTIVE && relationship.hospital.status === HospitalStatus.ACTIVE)
  ) eligible.push(Role.OSM);

  if (roles.includes(Role.PATIENT)) {
    const actor: ActorContext = {
      userId: user.id,
      personId: user.personId,
      roles,
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    if (await resolveOwnPatientContext(actor, { database })) eligible.push(Role.PATIENT);
  }
  return normalizeEligibleLineRoles(eligible);
}
