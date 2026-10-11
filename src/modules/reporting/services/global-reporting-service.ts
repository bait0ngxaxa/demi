import "server-only";

import { HospitalStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getHospitalHierarchyDirectory,
  type HospitalHierarchyDirectory,
  type HospitalHierarchyUnit,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import {
  ApplicationError,
  InfrastructureError,
} from "@/shared/errors/application-error";

import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import type { GlobalReportingDirectory } from "../projections/global-reporting-projection";
import {
  globalReportingAuditReasonForError,
  recordGlobalReportingAudit,
  resolveGlobalReportingAccessContext,
} from "./global-reporting-access-service";

function getUnits(directory: HospitalHierarchyDirectory): HospitalHierarchyUnit[] {
  const units = new Map<string, HospitalHierarchyUnit>();
  for (const group of directory.groups) {
    units.set(group.mainHospital.id, group.mainHospital);
    for (const child of group.directChildren) units.set(child.id, child);
  }
  for (const diagnostic of directory.diagnostics) {
    units.set(diagnostic.hospital.id, diagnostic.hospital);
  }
  return [...units.values()];
}

function getStatusCounts(directory: HospitalHierarchyDirectory): Readonly<Record<HospitalStatus, number>> {
  const counts: Record<HospitalStatus, number> = {
    [HospitalStatus.ACTIVE]: 0,
    [HospitalStatus.PENDING_VERIFICATION]: 0,
    [HospitalStatus.SUSPENDED]: 0,
  };
  for (const hospital of getUnits(directory)) counts[hospital.status] += 1;
  return counts;
}

export async function getGlobalReportingDirectory(
  actor: ActorContext | null | undefined,
  database: PrismaClient = getPrisma(),
): Promise<GlobalReportingDirectory> {
  try {
    await resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      database,
    );
    const hierarchy = await getHospitalHierarchyDirectory(actor, database);
    await resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      database,
    );
    await recordGlobalReportingAudit({
      actorUserId: actor?.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      outcome: "read",
    });
    return { hierarchy, statusCounts: getStatusCounts(hierarchy) };
  } catch (error: unknown) {
    await recordGlobalReportingAudit({
      actorUserId: actor?.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      outcome: "denied",
      reason: globalReportingAuditReasonForError(error),
    });
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Global reporting directory could not be loaded");
  }
}

export function getGlobalReportingHospitalById(
  directory: GlobalReportingDirectory,
  hospitalId: string,
): HospitalHierarchyUnit | null {
  for (const group of directory.hierarchy.groups) {
    if (group.mainHospital.id === hospitalId) return group.mainHospital;
    const child = group.directChildren.find(({ id }) => id === hospitalId);
    if (child) return child;
  }
  return directory.hierarchy.diagnostics.find(({ hospital }) => hospital.id === hospitalId)?.hospital ?? null;
}

export const globalReportingServiceInternals = { getStatusCounts, getUnits };
