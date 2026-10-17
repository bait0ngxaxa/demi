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
  /** Grouping label only (ADR-0013 §2): the current Parent, or the Hospital itself when it has none. Grants nothing. */
  network: { hospitalId: string; name: string };
  /** Only gates the Parent area entry; the area page re-resolves Parent OWNER authority and each Child server-side. */
  hasActiveDirectChildren: boolean;
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
        parentHospital: { select: { id: true, name: true } },
        _count: { select: { childHospitals: { where: { status: HospitalStatus.ACTIVE } } } },
      },
    });

    return hospitals.map((hospital) => ({
      hospitalId: hospital.id,
      hospitalCode: hospital.hospitalCode,
      hospitalName: hospital.name,
      hospitalStatus: hospital.status,
      network: hospital.parentHospital
        ? { hospitalId: hospital.parentHospital.id, name: hospital.parentHospital.name }
        : { hospitalId: hospital.id, name: hospital.name },
      hasActiveDirectChildren: hospital.parentHospital === null && hospital._count.childHospitals > 0,
    }));
  } catch {
    throw new InfrastructureError("Actor Hospital workspace could not be loaded");
  }
}
