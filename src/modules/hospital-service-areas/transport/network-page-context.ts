import "server-only";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import { listNetworkScopes, type HospitalNetworkFacility } from "../services/hospital-network-access";
import {
  listEligibleServiceAreaCandidates,
  listManagedHospitalServiceAreas,
  type ServiceAreaCandidate,
} from "../services/hospital-service-area-service";

export type OwnerNetworkPageContext = {
  parents: HospitalNetworkFacility[];
  selected: {
    parent: HospitalNetworkFacility;
    areas: { areaId: string; createdAt: Date; child: HospitalNetworkFacility }[];
    candidates: ServiceAreaCandidate[];
    hasMoreCandidates: boolean;
    query: string;
  } | null;
};

const MAX_AREAS = 100;
const MAX_CANDIDATES = 30;

/**
 * Parent OWNER network management (ADR-0015). Lists only Parents the actor directly OWNS; the area and
 * candidate services re-authorize the selected Parent against persisted state on every request.
 */
export async function getOwnerNetworkPageContext(
  actor: ActorContext,
  input: { hospitalId?: string; query?: string },
): Promise<OwnerNetworkPageContext> {
  const database = getPrisma();
  const parents = (await listNetworkScopes(database, actor.userId, "OWNER")).map(({ parent }) => parent);
  const parent = input.hospitalId === undefined
    ? parents[0]
    : parents.find(({ id }) => id === input.hospitalId);
  if (!parent) return { parents, selected: null };

  const query = (input.query ?? "").trim().slice(0, 100);
  const [areaPage, candidatePage] = await Promise.all([
    listManagedHospitalServiceAreas(actor, { parentHospitalId: parent.id, limit: MAX_AREAS }),
    listEligibleServiceAreaCandidates(actor, {
      parentHospitalId: parent.id,
      limit: MAX_CANDIDATES,
      ...(query ? { query } : {}),
    }),
  ]);
  const children = await database.hospital.findMany({
    where: { id: { in: areaPage.items.map(({ childHospitalId }) => childHospitalId) } },
    select: { id: true, hospitalCode: true, name: true },
  });
  const childById = new Map(children.map((child) => [child.id, child]));

  return {
    parents,
    selected: {
      parent,
      areas: areaPage.items
        .flatMap(({ id, createdAt, childHospitalId }) => {
          const child = childById.get(childHospitalId);
          return child ? [{ areaId: id, createdAt, child }] : [];
        })
        .sort((left, right) => left.child.name.localeCompare(right.child.name, "th")),
      candidates: candidatePage.items,
      hasMoreCandidates: candidatePage.nextAfterId !== null,
      query,
    },
  };
}
