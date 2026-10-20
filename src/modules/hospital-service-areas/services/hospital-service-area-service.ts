import "server-only";

import { HospitalStatus, MembershipStatus, MembershipType, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction, isRetryableSerializableTransactionError } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { hasServiceAreaEligibility, isEligibleServiceAreaPair, type ServiceAreaFacility } from "../domain/service-area-eligibility";
import { assertHospitalServiceAreaPolicy, HOSPITAL_SERVICE_AREA_CAPABILITIES, type HospitalServiceAreaCapability } from "../policies/hospital-service-area-policy";
import { serviceAreaAttachSchema, serviceAreaCandidatePageSchema, serviceAreaEndSchema, serviceAreaPageSchema } from "../schemas/hospital-service-area-schemas";

export const facilitySelect = {
  id: true, hospitalCode: true, name: true, status: true,
  serviceAreaEligibility: { select: { kind: true } },
} satisfies Prisma.HospitalSelect;

export const areaSelect = {
  id: true, parentHospitalId: true, childHospitalId: true, createdAt: true, endedAt: true,
} satisfies Prisma.HospitalServiceAreaSelect;

export type HospitalServiceAreaProjection = Prisma.HospitalServiceAreaGetPayload<{ select: typeof areaSelect }>;
export type ServiceAreaCandidate = { id: string; hospitalCode: string; name: string };
export type ServiceAreaPage<T> = { items: T[]; nextAfterId: string | null };
export type HospitalServiceAreaDependencies = { database?: PrismaClient };

async function authorize(
  tx: Prisma.TransactionClient, actor: ActorContext, parentHospitalId: string,
  capability: HospitalServiceAreaCapability,
): Promise<ServiceAreaFacility> {
  assertHospitalServiceAreaPolicy({ actor, capability, parentHospitalId });
  const membership = await tx.hospitalMembership.findFirst({
    where: {
      hospitalId: parentHospitalId, userId: actor.userId,
      membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE,
      user: { is: { personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } },
      hospital: { is: { status: HospitalStatus.ACTIVE } },
    },
    select: { hospital: { select: facilitySelect } },
  });
  if (!membership) throw new ForbiddenError();
  if (!hasServiceAreaEligibility(membership.hospital, "PARENT")) {
    throw new ValidationError("Parent service-area source classification is missing or inconsistent");
  }
  return membership.hospital;
}

export async function operation<T>(database: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    // No automatic replay: callers must reload after a conflict. Entire state + audit rolls back.
    return await runSerializableTransaction(database, work, 0);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    if (isRetryableSerializableTransactionError(error)) throw new ConflictError("Service area changed concurrently; reload before retrying");
    throw new InfrastructureError("Hospital service area operation could not be completed");
  }
}

/** Keeps the operational network one level deep even if network roles drift. */
export async function hasUnsupportedShape(tx: Prisma.TransactionClient, parentHospitalId: string, childHospitalId: string): Promise<boolean> {
  return await tx.hospital.findFirst({
    where: { id: { in: [parentHospitalId, childHospitalId] }, OR: [
      { id: childHospitalId, managedServiceAreas: { some: { endedAt: null } } },
      { id: parentHospitalId, serviceAreaAssignments: { some: { endedAt: null } } },
    ] }, select: { id: true },
  }) !== null;
}

export function page<T extends { id: string }>(rows: T[], limit: number): ServiceAreaPage<T> {
  const items = rows.slice(0, limit);
  return { items, nextAfterId: rows.length > limit ? items.at(-1)?.id ?? null : null };
}

/** Active assignments only. History stays in persistence and is never reactivated. */
export async function listManagedHospitalServiceAreas(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<ServiceAreaPage<HospitalServiceAreaProjection>> {
  if (!actor) throw new ForbiddenError();
  const parsed = serviceAreaPageSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { parentHospitalId, afterId, limit } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorize(tx, actor, parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.read);
    const rows = await tx.hospitalServiceArea.findMany({
      where: { parentHospitalId, endedAt: null, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: "asc" }, take: limit + 1, select: areaSelect,
    });
    return page(rows, limit);
  });
}

export async function listEligibleServiceAreaCandidates(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<ServiceAreaPage<ServiceAreaCandidate>> {
  if (!actor) throw new ForbiddenError();
  const parsed = serviceAreaCandidatePageSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { parentHospitalId, afterId, limit, query } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorize(tx, actor, parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.manage);
    // Any free CHILD facility (ADR-0015); occupied Children move only through Platform ADMIN transfer.
    const rows = await tx.hospital.findMany({
      where: {
        status: HospitalStatus.ACTIVE,
        serviceAreaEligibility: { is: { kind: "CHILD" } },
        serviceAreaAssignments: { none: { endedAt: null } },
        managedServiceAreas: { none: { endedAt: null } },
        ...(query ? { OR: [
          { name: { contains: query, mode: "insensitive" } },
          { hospitalCode: { contains: query, mode: "insensitive" } },
        ] } : {}),
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" }, take: limit + 1,
      select: { id: true, hospitalCode: true, name: true },
    });
    return page(rows, limit);
  });
}

export async function attachHospitalServiceArea(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalServiceAreaProjection> {
  if (!actor) throw new ForbiddenError();
  const parsed = serviceAreaAttachSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { parentHospitalId, childHospitalId } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    const parent = await authorize(tx, actor, parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.manage);
    const child = await tx.hospital.findUnique({ where: { id: childHospitalId }, select: facilitySelect });
    if (!child || !isEligibleServiceAreaPair(parent, child)) throw new ValidationError("Child facility is ineligible, inactive or lacks consistent source classification");
    const active = await tx.hospitalServiceArea.findFirst({ where: { childHospitalId, endedAt: null }, select: { parentHospitalId: true } });
    if (active) throw new ConflictError(active.parentHospitalId === parentHospitalId ? "Child facility is already attached" : "Child facility already has an active assignment");
    if (await hasUnsupportedShape(tx, parentHospitalId, childHospitalId)) throw new ValidationError("Unsupported service area hierarchy");
    const area = await tx.hospitalServiceArea.create({ data: { parentHospitalId, childHospitalId, createdByUserId: actor.userId }, select: areaSelect });
    await recordAuditEvent({ actorUserId: actor.userId, action: "hospital_service_area.attached", resourceType: "HospitalServiceArea", resourceId: area.id,
      metadata: { parentHospitalId, childHospitalId, fromStatus: null, toStatus: "ACTIVE" },
    }, tx);
    return area;
  });
}

export async function endHospitalServiceArea(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalServiceAreaProjection> {
  if (!actor) throw new ForbiddenError();
  const parsed = serviceAreaEndSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const { parentHospitalId, areaId, endReason } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    await authorize(tx, actor, parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.manage);
    const area = await tx.hospitalServiceArea.findFirst({ where: { id: areaId, parentHospitalId }, select: areaSelect });
    if (!area) throw new NotFoundError();
    if (area.endedAt !== null) throw new ConflictError("Service area has already ended");
    // Ending remains possible when a Child is suspended/reclassified: it removes the association, never grants access.
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    if (!now) throw new InfrastructureError();
    const result = await tx.hospitalServiceArea.updateMany({
      where: { id: areaId, parentHospitalId, endedAt: null }, data: { endedAt: now, endedByUserId: actor.userId, endReason },
    });
    if (result.count !== 1) throw new ConflictError("Service area changed concurrently");
    await recordAuditEvent({ actorUserId: actor.userId, action: "hospital_service_area.ended", resourceType: "HospitalServiceArea", resourceId: areaId,
      metadata: { parentHospitalId, childHospitalId: area.childHospitalId, fromStatus: "ACTIVE", toStatus: "ENDED", reasonStored: true },
    }, tx);
    const ended = await tx.hospitalServiceArea.findFirst({ where: { id: areaId, parentHospitalId, endedAt: now }, select: areaSelect });
    if (!ended) throw new ConflictError("Service area changed concurrently");
    return ended;
  });
}

/** Relationship evidence only. This is NOT Patient/report/workforce authorization. */
export async function resolveActiveHospitalServiceArea(
  actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalServiceAreaDependencies = {},
): Promise<HospitalServiceAreaProjection> {
  if (!actor) throw new ForbiddenError();
  const parsed = serviceAreaAttachSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  const { parentHospitalId, childHospitalId } = parsed.data;
  return operation(dependencies.database ?? getPrisma(), async (tx) => {
    const parent = await authorize(tx, actor, parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.read);
    const child = await tx.hospital.findUnique({ where: { id: childHospitalId }, select: facilitySelect });
    if (!child || !isEligibleServiceAreaPair(parent, child)) throw new NotFoundError();
    if (await hasUnsupportedShape(tx, parentHospitalId, childHospitalId)) throw new NotFoundError();
    const area = await tx.hospitalServiceArea.findFirst({ where: { parentHospitalId, childHospitalId, endedAt: null }, select: areaSelect });
    if (!area) throw new NotFoundError();
    return area;
  });
}
