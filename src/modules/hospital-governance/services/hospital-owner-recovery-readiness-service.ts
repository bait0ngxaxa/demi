import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";

export type HospitalOwnerRecoveryReadinessDependencies = { database?: PrismaClient };

export async function countSoleActiveOwnerHospitals(
  actor: ActorContext,
  dependencies: HospitalOwnerRecoveryReadinessDependencies = {},
): Promise<number> {
  if (!actor.roles.includes(Role.HOSPITAL) || actor.roles.includes(Role.ADMIN)) return 0;

  const ownedHospitalIds = [...new Set(actor.hospitalMemberships
    .filter((membership) => membership.membershipType === MembershipType.OWNER &&
      membership.status === MembershipStatus.ACTIVE && membership.hospitalStatus === HospitalStatus.ACTIVE)
    .map((membership) => membership.hospitalId))];
  if (ownedHospitalIds.length === 0) return 0;

  const memberships = await (dependencies.database ?? getPrisma()).hospitalMembership.findMany({
    where: {
      hospitalId: { in: ownedHospitalIds },
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
      user: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } },
    },
    select: { hospitalId: true, userId: true },
  });
  const ownerIds = new Map<string, Set<string>>();
  for (const membership of memberships) {
    const hospitalOwners = ownerIds.get(membership.hospitalId) ?? new Set<string>();
    hospitalOwners.add(membership.userId);
    ownerIds.set(membership.hospitalId, hospitalOwners);
  }

  return ownedHospitalIds.filter((hospitalId) => ownerIds.get(hospitalId)?.size === 1).length;
}
