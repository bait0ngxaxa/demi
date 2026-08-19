import "server-only";

import { HospitalStatus } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError } from "@/shared/errors/application-error";

export type ActorHospitalWorkspace = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
  hospitalStatus: HospitalStatus;
};

export async function listActorHospitalWorkspaces(
  actor: ActorContext,
): Promise<ActorHospitalWorkspace[]> {
  const hospitalIds = [
    ...new Set([
      ...actor.hospitalMemberships.map(({ hospitalId }) => hospitalId),
      ...actor.osmHospitalRelationships.map(({ hospitalId }) => hospitalId),
    ]),
  ];

  if (hospitalIds.length === 0) {
    return [];
  }

  try {
    const hospitals = await getPrisma().hospital.findMany({
      where: { id: { in: hospitalIds } },
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
      select: {
        id: true,
        hospitalCode: true,
        name: true,
        status: true,
      },
    });

    return hospitals.map((hospital) => ({
      hospitalId: hospital.id,
      hospitalCode: hospital.hospitalCode,
      hospitalName: hospital.name,
      hospitalStatus: hospital.status,
    }));
  } catch {
    throw new InfrastructureError("Actor Hospital workspace could not be loaded");
  }
}
