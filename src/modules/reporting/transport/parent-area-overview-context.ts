import "server-only";

import { redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import type { ParentChildHospitalReportingProjection } from "../projections/hospital-report-projection";
import { listHospitalReportingHospitals } from "../services/hospital-report-access-service";
import { getParentChildHospitalReportingPage } from "../services/hospital-report-query-service";
import { listParentChildHospitalReportTargetGroups } from "../services/parent-child-hospital-report-access-service";

export type ParentAreaOverviewGroup = {
  parent: { id: string; name: string };
  areas: readonly ParentChildHospitalReportingProjection[];
};

const MAX_CONCURRENT_CHILD_REPORTS = 4;

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

/**
 * ADR-0016: an area is an active network Child of a Parent the actor directly OWNS. Each Child's nine values come
 * from the existing exact-Child read path, which re-authorizes and audits per Child; no other Child data is loaded.
 */
export async function getParentAreaOverviewContext(): Promise<ParentAreaOverviewGroup[]> {
  const actor = await resolveActor();
  const ownedHospitals = await listHospitalReportingHospitals(actor);
  const parentGroups = await listParentChildHospitalReportTargetGroups(
    actor,
    ownedHospitals.map(({ id }) => id),
  );
  if (parentGroups.length === 0) redirect("/app");

  const childJobs = parentGroups.flatMap((group) =>
    group.children.map((child) => ({ parentHospitalId: group.parent.id, child })),
  );
  const childReports: (ParentChildHospitalReportingProjection | null)[] = [];

  for (let offset = 0; offset < childJobs.length; offset += MAX_CONCURRENT_CHILD_REPORTS) {
    const batch = childJobs.slice(offset, offset + MAX_CONCURRENT_CHILD_REPORTS);
    const batchReports = await Promise.all(batch.map(async ({ parentHospitalId, child }) => {
      try {
        return await getParentChildHospitalReportingPage(actor, {
          parentHospitalId,
          hospitalId: child.id,
        });
      } catch (error: unknown) {
        // The link or status changed after listing: the Child is no longer an area of this Parent.
        if (error instanceof ForbiddenError || error instanceof NotFoundError) return null;
        throw error;
      }
    }));
    childReports.push(...batchReports);
  }

  let childOffset = 0;
  return parentGroups.map((group) => {
    const areas = childReports.slice(childOffset, childOffset + group.children.length);
    childOffset += group.children.length;
    return {
      parent: group.parent,
      areas: areas.filter((area): area is ParentChildHospitalReportingProjection => area !== null),
    };
  });
}
