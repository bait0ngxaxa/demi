import "server-only";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import { listManagedChildFacilities, type ManagedChildFacility } from "../services/child-facility-service";
import { listNetworkScopes, type HospitalNetworkFacility } from "../services/hospital-network-access";
import { listEligibleServiceAreaCandidates, type ServiceAreaCandidate } from "../services/hospital-service-area-service";

export type OwnerNetworkPageContext = {
  parents: HospitalNetworkFacility[];
  selected: {
    parent: HospitalNetworkFacility;
    children: ManagedChildFacility[];
    candidates: ServiceAreaCandidate[];
    hasMoreCandidates: boolean;
    query: string;
  } | null;
};

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
  const [children, candidatePage] = await Promise.all([
    // ADR-0018: attached Children (Parent-created or attached free ones) with their OWNER invitation state.
    listManagedChildFacilities(actor, { parentHospitalId: parent.id }),
    listEligibleServiceAreaCandidates(actor, {
      parentHospitalId: parent.id,
      limit: MAX_CANDIDATES,
      ...(query ? { query } : {}),
    }),
  ]);

  return {
    parents,
    selected: {
      parent,
      children,
      candidates: candidatePage.items,
      hasMoreCandidates: candidatePage.nextAfterId !== null,
      query,
    },
  };
}
