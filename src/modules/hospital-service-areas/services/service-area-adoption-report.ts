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
 * Report-only. There is deliberately no import/apply operation without an approved classification source.
 */
export async function reportHospitalServiceAreaAdoption(database: PrismaClient): Promise<ServiceAreaAdoptionRow[]> {
  return database.$transaction(async (tx) => {
    const facilities = await tx.hospital.findMany({
      orderBy: { id: "asc" },
      select: { id: true, status: true, parentHospitalId: true,
        serviceAreaEligibility: { select: { kind: true, sourceReference: true, verifiedAt: true } } },
    });
    const areas = await tx.hospitalServiceArea.findMany({ select: { parentHospitalId: true, childHospitalId: true, endedAt: true } });
    const byId = new Map(facilities.map((facility) => [facility.id, facility]));
    const historyByChild = new Map<string, typeof areas>();
    const parentIds = new Set(facilities.flatMap(({ parentHospitalId }) => parentHospitalId ? [parentHospitalId] : []));
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
      if (!parent || !isEligibleServiceAreaPair(parent, child) || parentIds.has(child.id) ||
          operationalParents.has(child.id) || operationalChildren.has(parent.id)) {
        disposition = "BLOCKED_CLASSIFICATION_OR_HIERARCHY";
      } else if (history.some((area) => area.parentHospitalId !== parent.id)) {
        disposition = "BLOCKED_ASSIGNMENT_CONFLICT";
      } else if (history.some((area) => area.endedAt === null)) {
        disposition = "ALREADY_ACTIVE";
      } else if (history.length > 0) {
        disposition = "ENDED_REQUIRES_EXPLICIT_REATTACH";
      } else {
        disposition = "READY_FOR_OWNER_ATTACH";
      }
      return [{ parentHospitalId: child.parentHospitalId, childHospitalId: child.id, disposition }];
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
