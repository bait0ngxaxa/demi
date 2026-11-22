import "server-only";

import { redirect } from "next/navigation";

import { getRequestApplicationActor } from "@/modules/auth/services/request-application-actor";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import type { ParentChildHospitalReportingProjection } from "../projections/hospital-report-projection";
import { PARENT_CHILD_REPORT_BATCH_MAX_CHILDREN } from "../schemas/hospital-report-schemas";
import { listHospitalReportingHospitals } from "../services/hospital-report-access-service";
import { getParentChildHospitalReportingPages } from "../services/hospital-report-query-service";
import { listParentChildHospitalReportTargetGroups, type ParentChildHospitalReportTargetGroup } from "../services/parent-child-hospital-report-access-service";

export type ParentAreaOverviewGroup = ParentChildHospitalReportTargetGroup & {
  areas: readonly ParentChildHospitalReportingProjection[];
};

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getRequestApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

/**
 * ADR-0016: an area is an active network Child of a Parent the actor directly OWNS. Each Parent's Children are read
 * together: every Child is still authorized and audited individually and keeps only its own nine values, but in one
 * snapshot and one connection per Parent instead of one transaction per Child (audit P2: pool pressure).
 */
export async function getParentAreaOverviewContext(): Promise<ParentAreaOverviewGroup[]> {
  const actor = await resolveActor();
  const ownedHospitals = await listHospitalReportingHospitals(actor);
  const parentGroups = await listParentChildHospitalReportTargetGroups(
    actor,
    ownedHospitals.map(({ id }) => id),
  );
  if (parentGroups.length === 0) redirect("/app");

  const groups: ParentAreaOverviewGroup[] = [];
  for (const group of parentGroups) {
    groups.push({ ...group, areas: await readChildAreas(actor, group) });
  }
  return groups;
}

async function readChildAreas(
  actor: ActorContext,
  group: ParentChildHospitalReportTargetGroup,
): Promise<ParentChildHospitalReportingProjection[]> {
  const reports = new Map<string, ParentChildHospitalReportingProjection | null>();
  // Batches run one after another, so the overview still holds at most one connection.
  for (let offset = 0; offset < group.children.length; offset += PARENT_CHILD_REPORT_BATCH_MAX_CHILDREN) {
    const batch = group.children.slice(offset, offset + PARENT_CHILD_REPORT_BATCH_MAX_CHILDREN);
    try {
      const batchReports = await getParentChildHospitalReportingPages(actor, {
        parentHospitalId: group.parent.id,
        hospitalIds: batch.map(({ id }) => id),
      });
      for (const [hospitalId, report] of batchReports) reports.set(hospitalId, report);
    } catch (error: unknown) {
      // The Parent link or status changed after listing: none of its Children is an area any more.
      if (error instanceof ForbiddenError || error instanceof NotFoundError) return [];
      throw error;
    }
  }
  // A Child whose link or status changed after listing is no longer an area of this Parent.
  return group.children.flatMap(({ id }) => {
    const report = reports.get(id);
    return report ? [report] : [];
  });
}
