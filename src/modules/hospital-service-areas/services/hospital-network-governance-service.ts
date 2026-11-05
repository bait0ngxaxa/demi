import "server-only";

import { HospitalStatus, type HospitalServiceAreaFacilityKind, type Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assertHospitalGovernanceCapability, HOSPITAL_GOVERNANCE_CAPABILITIES } from "@/modules/hospital-governance/policies/hospital-governance-policy";
import { assertPlatformAdminInDatabase } from "@/modules/hospital-governance/services/hospital-governance-service";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { resolvePagePosition, type PageNumberPosition } from "@/shared/pagination/page-number";
import { isEligibleServiceAreaPair } from "../domain/service-area-eligibility";
import {
  governedAreaEndSchema, governedAreaPageSchema, governedAreaTransferSchema, governedHospitalIdSchema, HOSPITAL_DIRECTORY_PAGE_SIZE,
  HOSPITAL_TRANSFER_TARGET_SEARCH_LIMIT, hospitalDirectoryQuerySchema, networkRoleClearSchema, networkRoleSetSchema,
  transferTargetSearchSchema, type HospitalDirectoryQuery,
} from "../schemas/hospital-service-area-schemas";
import {
  areaSelect, facilitySelect, hasUnsupportedShape, operation, page,
  type HospitalServiceAreaDependencies, type HospitalServiceAreaProjection, type ServiceAreaPage,
} from "./hospital-service-area-service";

export type HospitalNetworkRoleProjection = {
  hospitalId: string;
  kind: HospitalServiceAreaFacilityKind;
  verifiedAt: Date;
  classifiedByUserId: string | null;
};
export type HospitalServiceAreaTransferResult = { ended: HospitalServiceAreaProjection; created: HospitalServiceAreaProjection };

const roleSelect = { hospitalId: true, kind: true, verifiedAt: true, classifiedByUserId: true } satisfies Prisma.HospitalServiceAreaEligibilitySelect;
// N1-D3: a RETIRED Hospital's network role is frozen until it is restored.
const RETIRED_ROLE_CONFLICT = "A retired Hospital's network role cannot be changed";

/** Platform ADMIN only (ADR-0015). Context check first, persisted ADMIN proof inside the transaction. */
async function authorizeAdmin(
  tx: Prisma.TransactionClient, actor: ActorContext,
  capability: typeof HOSPITAL_GOVERNANCE_CAPABILITIES.networkRoleManage | typeof HOSPITAL_GOVERNANCE_CAPABILITIES.networkAreaGovern,
): Promise<void> {
  assertHospitalGovernanceCapability(actor, capability);
  await assertPlatformAdminInDatabase(tx, actor.userId);
}

async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  // Transaction time, so a transfer's ended and new rows meet at the same instant.
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT CURRENT_TIMESTAMP AS now`;
  if (!row?.now) throw new InfrastructureError();
  return row.now;
}

async function hasActiveAreas(tx: Prisma.TransactionClient, hospitalId: string, kind: HospitalServiceAreaFacilityKind): Promise<boolean> {
  return await tx.hospitalServiceArea.findFirst({
    where: kind === "PARENT" ? { parentHospitalId: hospitalId, endedAt: null } : { childHospitalId: hospitalId, endedAt: null },
    select: { id: true },
  }) !== null;
}

async function endActiveArea(
  tx: Prisma.TransactionClient, areaId: string, actorUserId: string, endReason: string, now: Date,
): Promise<HospitalServiceAreaProjection> {
  const area = await tx.hospitalServiceArea.findUnique({ where: { id: areaId }, select: areaSelect });
  if (!area) throw new NotFoundError();
  if (area.endedAt !== null) throw new ConflictError("Service area has already ended");
  const result = await tx.hospitalServiceArea.updateMany({
    where: { id: areaId, endedAt: null }, data: { endedAt: now, endedByUserId: actorUserId, endReason },
  });
  if (result.count !== 1) throw new ConflictError("Service area changed concurrently");
  await recordAuditEvent({ actorUserId, action: "hospital_service_area.ended", resourceType: "HospitalServiceArea", resourceId: areaId,
    metadata: { parentHospitalId: area.parentHospitalId, childHospitalId: area.childHospitalId, fromStatus: "ACTIVE", toStatus: "ENDED", reasonStored: true, governance: true },
  }, tx);
  return { ...area, endedAt: now };
}

export async function setHospitalNetworkRole(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalNetworkRoleProjection> {
  if (!actor) throw new ForbiddenError();
  const parsed = networkRoleSetSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { hospitalId, kind } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorizeAdmin(tx, actor, HOSPITAL_GOVERNANCE_CAPABILITIES.networkRoleManage);
    const hospital = await tx.hospital.findUnique({ where: { id: hospitalId }, select: { status: true, serviceAreaEligibility: { select: { kind: true } } } });
    if (!hospital) throw new NotFoundError();
    if (hospital.status === HospitalStatus.RETIRED) throw new ConflictError(RETIRED_ROLE_CONFLICT);
    const fromKind = hospital.serviceAreaEligibility?.kind ?? null;
    if (fromKind && fromKind !== kind && await hasActiveAreas(tx, hospitalId, fromKind)) {
      throw new ConflictError("End or transfer active service areas before changing the network role");
    }
    const now = await databaseNow(tx);
    const data = { kind, verifiedAt: now, classifiedByUserId: actor.userId };
    const role = await tx.hospitalServiceAreaEligibility.upsert({
      where: { hospitalId }, create: { hospitalId, ...data }, update: data, select: roleSelect,
    });
    await recordAuditEvent({ actorUserId: actor.userId, action: "hospital_network_role.set", resourceType: "Hospital", resourceId: hospitalId,
      metadata: { hospitalId, fromKind, toKind: kind },
    }, tx);
    return role;
  });
}

export async function clearHospitalNetworkRole(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<void> {
  if (!actor) throw new ForbiddenError();
  const parsed = networkRoleClearSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { hospitalId } = parsed.data;
  await operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorizeAdmin(tx, actor, HOSPITAL_GOVERNANCE_CAPABILITIES.networkRoleManage);
    const role = await tx.hospitalServiceAreaEligibility.findUnique({ where: { hospitalId }, select: { kind: true, hospital: { select: { status: true } } } });
    if (!role) throw new NotFoundError();
    if (role.hospital.status === HospitalStatus.RETIRED) throw new ConflictError(RETIRED_ROLE_CONFLICT);
    if (await hasActiveAreas(tx, hospitalId, role.kind)) {
      throw new ConflictError("End or transfer active service areas before clearing the network role");
    }
    await tx.hospitalServiceAreaEligibility.delete({ where: { hospitalId } });
    await recordAuditEvent({ actorUserId: actor.userId, action: "hospital_network_role.cleared", resourceType: "Hospital", resourceId: hospitalId,
      metadata: { hospitalId, fromKind: role.kind, toKind: null },
    }, tx);
  });
}

/** Any Parent's active associations, for governance screens. Grants no Patient access. */
export async function listHospitalServiceAreasForAdmin(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<ServiceAreaPage<HospitalServiceAreaProjection>> {
  if (!actor) throw new ForbiddenError();
  const parsed = governedAreaPageSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { parentHospitalId, afterId, limit } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorizeAdmin(tx, actor, HOSPITAL_GOVERNANCE_CAPABILITIES.networkAreaGovern);
    const rows = await tx.hospitalServiceArea.findMany({
      where: { parentHospitalId, endedAt: null, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: "asc" }, take: limit + 1, select: areaSelect,
    });
    return page(rows, limit);
  });
}

export type HospitalNetworkFacilitySummary = { id: string; hospitalCode: string; name: string; status: HospitalStatus };
export type HospitalNetworkAdminView = {
  role: HospitalServiceAreaFacilityKind | null;
  /** Active associations where this Hospital is the Parent. */
  children: { areaId: string; createdAt: Date; child: HospitalNetworkFacilitySummary }[];
  /** The active association where this Hospital is the Child, if any. */
  parentArea: { areaId: string; createdAt: Date; parent: HospitalNetworkFacilitySummary } | null;
};

const summarySelect = { id: true, hospitalCode: true, name: true, status: true } satisfies Prisma.HospitalSelect;

/** Network placement of one Hospital for the governance screen. Identity data only; never Patient data. */
export async function getHospitalNetworkForAdmin(
  actor: ActorContext | null | undefined, hospitalId: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalNetworkAdminView> {
  if (!actor) throw new ForbiddenError();
  const parsed = governedHospitalIdSchema.safeParse(hospitalId);
  if (!parsed.success) throw new NotFoundError();
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorizeAdmin(tx, actor, HOSPITAL_GOVERNANCE_CAPABILITIES.networkAreaGovern);
    const hospital = await tx.hospital.findUnique({
      where: { id: parsed.data },
      select: {
        serviceAreaEligibility: { select: { kind: true } },
        managedServiceAreas: {
          where: { endedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, createdAt: true, child: { select: summarySelect } },
        },
        serviceAreaAssignments: {
          where: { endedAt: null },
          take: 1,
          select: { id: true, createdAt: true, parent: { select: summarySelect } },
        },
      },
    });
    if (!hospital) throw new NotFoundError();
    const parentArea = hospital.serviceAreaAssignments[0] ?? null;
    return {
      role: hospital.serviceAreaEligibility?.kind ?? null,
      children: hospital.managedServiceAreas.map(({ id, createdAt, child }) => ({ areaId: id, createdAt, child })),
      parentArea: parentArea ? { areaId: parentArea.id, createdAt: parentArea.createdAt, parent: parentArea.parent } : null,
    };
  });
}

export type HospitalNetworkDirectoryEntry = HospitalNetworkFacilitySummary & {
  role: HospitalServiceAreaFacilityKind | null;
  networkParentId: string | null;
  /** Name of the active network Parent, loaded only for the rows of the page. */
  networkParentName: string | null;
  /** ADR-0018 provenance: the Parent whose OWNER registered this Child, if any. */
  registeredForParentHospitalId: string | null;
  registeredForParentHospitalName: string | null;
};

export type HospitalNetworkDirectoryPage = PageNumberPosition & {
  items: HospitalNetworkDirectoryEntry[];
  /** Hospitals matching the filter and search across all pages. */
  total: number;
};

/** N1-D3: the network view leaves RETIRED Hospitals out; they are listed only under "ถอนแล้ว". */
function directoryFilterWhere(filter: HospitalDirectoryQuery["filter"]): Prisma.HospitalWhereInput {
  switch (filter) {
    case "network":
      return { status: { not: HospitalStatus.RETIRED } };
    case "pending":
      return { status: HospitalStatus.PENDING_VERIFICATION };
    case "retired":
      return { status: HospitalStatus.RETIRED };
  }
}

function hospitalNameOrCodeWhere(value: string | undefined): Prisma.HospitalWhereInput {
  return value
    ? { OR: [{ name: { contains: value, mode: "insensitive" } }, { hospitalCode: { contains: value, mode: "insensitive" } }] }
    : {};
}

/** One counted page of the governance directory with its network role and active Parent. Identity data only. */
export async function listHospitalNetworkDirectoryForAdmin(
  actor: ActorContext | null | undefined, input: unknown = {}, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalNetworkDirectoryPage> {
  if (!actor) throw new ForbiddenError();
  const parsed = hospitalDirectoryQuerySchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { filter, value, page: requestedPage } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorizeAdmin(tx, actor, HOSPITAL_GOVERNANCE_CAPABILITIES.networkAreaGovern);
    const where: Prisma.HospitalWhereInput = { AND: [directoryFilterWhere(filter), hospitalNameOrCodeWhere(value)] };
    const total = await tx.hospital.count({ where });
    const { skip, ...position } = resolvePagePosition(requestedPage, total, HOSPITAL_DIRECTORY_PAGE_SIZE);
    const hospitals = await tx.hospital.findMany({
      where,
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
      skip,
      take: HOSPITAL_DIRECTORY_PAGE_SIZE,
      select: {
        ...summarySelect,
        serviceAreaEligibility: { select: { kind: true } },
        serviceAreaAssignments: { where: { endedAt: null }, take: 1, select: { parentHospitalId: true } },
        registeredForParentHospitalId: true,
      },
    });
    // Only the Parents the page refers to: at most two per row.
    const parentIds = [...new Set(hospitals.flatMap(({ serviceAreaAssignments, registeredForParentHospitalId }) => [
      ...serviceAreaAssignments.map(({ parentHospitalId }) => parentHospitalId),
      ...(registeredForParentHospitalId ? [registeredForParentHospitalId] : []),
    ]))];
    const parents = parentIds.length === 0
      ? []
      : await tx.hospital.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } });
    const nameById = new Map(parents.map(({ id, name }) => [id, name]));
    return {
      ...position,
      total,
      items: hospitals.map(({ serviceAreaEligibility, serviceAreaAssignments, ...hospital }) => {
        const networkParentId = serviceAreaAssignments[0]?.parentHospitalId ?? null;
        return {
          ...hospital,
          role: serviceAreaEligibility?.kind ?? null,
          networkParentId,
          networkParentName: networkParentId ? nameById.get(networkParentId) ?? null : null,
          registeredForParentHospitalName: hospital.registeredForParentHospitalId
            ? nameById.get(hospital.registeredForParentHospitalId) ?? null
            : null,
        };
      }),
    };
  });
}

/**
 * Transfer targets for a Child with an active Parent: ACTIVE network PARENT Hospitals other than the current Parent,
 * by name or code, the first matches only. The transfer itself re-checks eligibility.
 */
export async function searchHospitalTransferTargetsForAdmin(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalNetworkFacilitySummary[]> {
  if (!actor) throw new ForbiddenError();
  const parsed = transferTargetSearchSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { hospitalId, value } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorizeAdmin(tx, actor, HOSPITAL_GOVERNANCE_CAPABILITIES.networkAreaGovern);
    const parentArea = await tx.hospitalServiceArea.findFirst({
      where: { childHospitalId: hospitalId, endedAt: null },
      select: { parentHospitalId: true },
    });
    if (!parentArea) return [];
    return tx.hospital.findMany({
      where: {
        AND: [
          { id: { not: parentArea.parentHospitalId }, status: HospitalStatus.ACTIVE, serviceAreaEligibility: { is: { kind: "PARENT" } } },
          hospitalNameOrCodeWhere(value),
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: HOSPITAL_TRANSFER_TARGET_SEARCH_LIMIT,
      select: summarySelect,
    });
  });
}

/** For Parents without a working OWNER; normal ending stays with the Parent OWNER. */
export async function adminEndHospitalServiceArea(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalServiceAreaProjection> {
  if (!actor) throw new ForbiddenError();
  const parsed = governedAreaEndSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { areaId, endReason } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorizeAdmin(tx, actor, HOSPITAL_GOVERNANCE_CAPABILITIES.networkAreaGovern);
    return endActiveArea(tx, areaId, actor.userId, endReason, await databaseNow(tx));
  });
}

/** Atomic end + new row; history is never rewritten. */
export async function transferHospitalServiceArea(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalServiceAreaTransferResult> {
  if (!actor) throw new ForbiddenError();
  const parsed = governedAreaTransferSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { areaId, toParentHospitalId, reason } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorizeAdmin(tx, actor, HOSPITAL_GOVERNANCE_CAPABILITIES.networkAreaGovern);
    const area = await tx.hospitalServiceArea.findUnique({ where: { id: areaId }, select: areaSelect });
    if (!area) throw new NotFoundError();
    if (area.endedAt !== null) throw new ConflictError("Service area has already ended");
    if (area.parentHospitalId === toParentHospitalId) throw new ValidationError("Target Parent already owns this service area");
    const [toParent, child] = await Promise.all([
      tx.hospital.findUnique({ where: { id: toParentHospitalId }, select: facilitySelect }),
      tx.hospital.findUnique({ where: { id: area.childHospitalId }, select: facilitySelect }),
    ]);
    if (!toParent || !child || !isEligibleServiceAreaPair(toParent, child)) {
      throw new ValidationError("Target Parent or Child facility is ineligible, inactive or lacks a network role");
    }
    if (await hasUnsupportedShape(tx, toParentHospitalId, child.id)) throw new ValidationError("Unsupported service area hierarchy");
    const now = await databaseNow(tx);
    const ended = await endActiveArea(tx, areaId, actor.userId, reason, now);
    const created = await tx.hospitalServiceArea.create({
      data: { parentHospitalId: toParentHospitalId, childHospitalId: child.id, createdByUserId: actor.userId, createdAt: now },
      select: areaSelect,
    });
    await recordAuditEvent({ actorUserId: actor.userId, action: "hospital_service_area.transferred", resourceType: "HospitalServiceArea", resourceId: created.id,
      metadata: { fromAreaId: areaId, fromParentHospitalId: area.parentHospitalId, toParentHospitalId, childHospitalId: child.id, reasonStored: true },
    }, tx);
    return { ended, created };
  });
}
