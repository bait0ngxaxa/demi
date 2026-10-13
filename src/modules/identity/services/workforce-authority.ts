import { Role, type Prisma } from "@prisma/client";

/**
 * Pre-existing workforce authority on a User: the platform ADMIN role, any Hospital/OSM relationship (whatever its
 * status), or any unfinished workforce activation. A bare OSM/HOSPITAL role with no relationship grants no scope and
 * is not treated as authority (the existing Patient activation behavior). Used by Patient provisioning and activation so the Patient flow can never
 * become a way to establish the first global credential for authority it did not onboard.
 */
export const workforceAuthorityUserWhere = {
  OR: [
    { roles: { some: { role: Role.ADMIN } } },
    { memberships: { some: {} } },
    { osmHospitalRelationships: { some: {} } },
    { workforceActivations: { some: { usedAt: null } } },
  ],
} satisfies Prisma.UserWhereInput;

export async function userHasWorkforceAuthority(
  database: Pick<Prisma.TransactionClient, "user">,
  userId: string,
): Promise<boolean> {
  const user = await database.user.findFirst({
    where: { id: userId, ...workforceAuthorityUserWhere },
    select: { id: true },
  });

  return user !== null;
}
