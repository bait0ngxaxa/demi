import "server-only";

import { HospitalStatus, type HospitalServiceAreaFacilityKind } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError } from "@/shared/errors/application-error";

export type ActorHospitalWorkspace = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
  hospitalStatus: HospitalStatus;
  /** Grouping label only: the active operational network Parent (ADR-0016), or the Hospital itself. Grants nothing. */
  network: { hospitalId: string; name: string };
  /** ADMIN-set network role (ADR-0015); only gates entries, every destination re-resolves authority server-side. */
  networkRole: HospitalServiceAreaFacilityKind | null;
  /** Only gates Parent network entries; destinations re-resolve Parent authority and each Child server-side. */
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
        serviceAreaEligibility: { select: { kind: true } },
        serviceAreaAssignments: {
          where: { endedAt: null },
          take: 1,
          select: { parent: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            managedServiceAreas: { where: { endedAt: null, child: { is: { status: HospitalStatus.ACTIVE } } } },
          },
        },
      },
    });

    return hospitals.map((hospital) => {
      const networkParent = hospital.serviceAreaAssignments[0]?.parent ?? null;
      const networkRole = hospital.serviceAreaEligibility?.kind ?? null;
      return {
        hospitalId: hospital.id,
        hospitalCode: hospital.hospitalCode,
        hospitalName: hospital.name,
        hospitalStatus: hospital.status,
        network: networkParent
          ? { hospitalId: networkParent.id, name: networkParent.name }
          : { hospitalId: hospital.id, name: hospital.name },
        networkRole,
        hasActiveDirectChildren: networkRole === "PARENT" && hospital._count.managedServiceAreas > 0,
      };
    });
  } catch {
    throw new InfrastructureError("Actor Hospital workspace could not be loaded");
  }
}
