import "server-only";

import { HospitalStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getHospitalHierarchyDirectory,
  type HospitalHierarchyDirectory,
  type HospitalHierarchyUnit,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import { ApplicationError, ValidationError } from "@/shared/errors/application-error";
import { HOSPITAL_SEARCH_MAX_LENGTH, HOSPITAL_SEARCH_RESULT_LIMIT } from "@/shared/search/hospital-search";

import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import type { GlobalReportingDirectory } from "../projections/global-reporting-projection";
import {
  globalReportingAuditReasonForError,
  recordGlobalReportingAudit,
  resolveGlobalReportingAccessContext,
} from "./global-reporting-access-service";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

function getUnits(directory: HospitalHierarchyDirectory): HospitalHierarchyUnit[] {
  const units = new Map<string, HospitalHierarchyUnit>();
  for (const group of directory.groups) {
    units.set(group.mainHospital.id, group.mainHospital);
    for (const child of group.directChildren) units.set(child.id, child);
  }
  for (const hospital of directory.outsideNetwork) units.set(hospital.id, hospital);
  return [...units.values()];
}

function getStatusCounts(directory: HospitalHierarchyDirectory): Readonly<Record<HospitalStatus, number>> {
  const counts: Record<HospitalStatus, number> = {
    [HospitalStatus.ACTIVE]: 0,
    [HospitalStatus.PENDING_VERIFICATION]: 0,
    [HospitalStatus.SUSPENDED]: 0,
    [HospitalStatus.RETIRED]: 0,
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
    throw toInfrastructureError("reporting.getGlobalReportingDirectory", error, "Global reporting directory could not be loaded");
  }
}

/** A Hospital the system report can switch to; `parentName` and `registeredAt` tell same-named Hospitals apart. */
export type GlobalReportingHospitalOption = {
  id: string;
  name: string;
  parentName: string | null;
  registeredAt: Date;
};

const globalReportingHospitalSearchSchema = z.object({
  value: z.string().trim().min(1).max(HOSPITAL_SEARCH_MAX_LENGTH),
}).strict();

const SEARCHABLE_STATUSES = [
  HospitalStatus.ACTIVE,
  HospitalStatus.PENDING_VERIFICATION,
  HospitalStatus.SUSPENDED,
] as const;

/**
 * Platform ADMIN: the first HOSPITAL_SEARCH_RESULT_LIMIT Hospitals whose name contains the term, among those the
 * directory lists (never RETIRED). Hospital codes are internal, so only names match. The report page re-checks
 * access to the Hospital that is opened.
 */
export async function searchGlobalReportingHospitals(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: PrismaClient = getPrisma(),
): Promise<GlobalReportingHospitalOption[]> {
  const parsed = globalReportingHospitalSearchSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Hospital search is invalid");
  await resolveGlobalReportingAccessContext(actor, GLOBAL_REPORTING_CAPABILITIES.directoryRead, undefined, database);
  try {
    const hospitals = await database.hospital.findMany({
      where: { status: { in: [...SEARCHABLE_STATUSES] }, name: { contains: parsed.data.value, mode: "insensitive" } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: HOSPITAL_SEARCH_RESULT_LIMIT,
      select: {
        id: true,
        name: true,
        createdAt: true,
        serviceAreaAssignments: { where: { endedAt: null }, take: 1, select: { parent: { select: { name: true } } } },
      },
    });
    return hospitals.map(({ id, name, createdAt, serviceAreaAssignments }) => ({
      id,
      name,
      parentName: serviceAreaAssignments[0]?.parent.name ?? null,
      registeredAt: createdAt,
    }));
  } catch (error: unknown) {
    throw toInfrastructureError("reporting.searchGlobalReportingHospitals", error, "Global reporting Hospital search failed");
  }
}

export const globalReportingServiceInternals = { getStatusCounts, getUnits };
