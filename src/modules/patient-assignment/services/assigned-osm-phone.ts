import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

/** For an already-authorized care/SELF read; never pass a caregiver audience here. */
export async function loadAssignedOsmPhone(
  database: PrismaClient | Prisma.TransactionClient,
  relationshipId: string,
  expectedOsmUserId?: string,
): Promise<string | null> {
  const relationship = await database.patientHospitalRelationship.findFirst({
    where: { id: relationshipId, endedAt: null, hospital: { status: "ACTIVE" } },
    select: { hospitalId: true, osmAssignments: {
      where: { endedAt: null, ...(expectedOsmUserId ? { osmUserId: expectedOsmUserId } : {}), osmUser: { status: "ACTIVE", roles: { some: { role: "OSM" } } } },
      take: 1, select: { osmUserId: true },
    } },
  });
  const assignment = relationship?.osmAssignments[0];
  if (!relationship || !assignment) return null;
  const osm = await database.osmHospitalRelationship.findFirst({
    where: { userId: assignment.osmUserId, hospitalId: relationship.hospitalId, status: "ACTIVE", hospital: { status: "ACTIVE" },
      user: { status: "ACTIVE", roles: { some: { role: "OSM" } } } },
    select: { contactPhone: true },
  });
  return osm?.contactPhone ?? null;
}
