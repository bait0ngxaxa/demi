import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { isEligibleServiceAreaPair } from "../domain/service-area-eligibility";

export type ServiceAreaAdoptionRow = {
  parentHospitalId: string;
  childHospitalId: string;
  disposition: "READY_FOR_OWNER_ATTACH" | "ALREADY_ACTIVE" | "ENDED_REQUIRES_EXPLICIT_REATTACH" |
    "BLOCKED_CLASSIFICATION_OR_HIERARCHY" | "BLOCKED_ASSIGNMENT_CONFLICT";
};

/** Trusted offline maintenance primitive, like master reconciliation; never expose directly as an action/route.
 * Report-only: lists canonical pairs as suggestions for explicit OWNER attachment or ADMIN transfer (ADR-0015).
 */
export async function reportHospitalServiceAreaAdoption(database: PrismaClient): Promise<ServiceAreaAdoptionRow[]> {
  return database.$transaction(async (tx) => {
    const facilities = await tx.hospital.findMany({
      orderBy: { id: "asc" },
      select: { id: true, status: true, parentHospitalId: true,
        serviceAreaEligibility: { select: { kind: true } } },
    });
    const areas = await tx.hospitalServiceArea.findMany({ select: { parentHospitalId: true, childHospitalId: true, endedAt: true } });
    const byId = new Map(facilities.map((facility) => [facility.id, facility]));
    const historyByChild = new Map<string, typeof areas>();
    const operationalParents = new Set(areas.filter(({ endedAt }) => endedAt === null).map(({ parentHospitalId }) => parentHospitalId));
    const operationalChildren = new Set(areas.filter(({ endedAt }) => endedAt === null).map(({ childHospitalId }) => childHospitalId));
    for (const area of areas) {
      const history = historyByChild.get(area.childHospitalId) ?? [];
      history.push(area);
      historyByChild.set(area.childHospitalId, history);
    }
    return facilities.flatMap((child): ServiceAreaAdoptionRow[] => {
      if (!child.parentHospitalId) return [];
      const parent = byId.get(child.parentHospitalId);
      const history = historyByChild.get(child.id) ?? [];
      let disposition: ServiceAreaAdoptionRow["disposition"];
      const active = history.find((area) => area.endedAt === null);
      if (!parent || !isEligibleServiceAreaPair(parent, child) ||
          operationalParents.has(child.id) || operationalChildren.has(parent.id)) {
        disposition = "BLOCKED_CLASSIFICATION_OR_HIERARCHY";
      } else if (active && active.parentHospitalId !== parent.id) {
        disposition = "BLOCKED_ASSIGNMENT_CONFLICT";
      } else if (active) {
        disposition = "ALREADY_ACTIVE";
      } else if (history.some((area) => area.parentHospitalId === parent.id)) {
        disposition = "ENDED_REQUIRES_EXPLICIT_REATTACH";
      } else {
        disposition = "READY_FOR_OWNER_ATTACH";
      }
      return [{ parentHospitalId: child.parentHospitalId, childHospitalId: child.id, disposition }];
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
