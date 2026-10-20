import "server-only";

import { HospitalContentStatus, HospitalStatus, MembershipStatus, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import type { HospitalContentPatientDetail, HospitalContentPatientListItem } from "../types/hospital-content-patient-projections";
import { hospitalContentLocatorSchema } from "../schemas/hospital-content-schemas";
import { HOSPITAL_CONTENT_PAGE_SIZE } from "../domain/hospital-content";
import { decodeHospitalContentWorkCursor, encodeHospitalContentWorkCursor } from "./hospital-content-work-cursor";

type Database = PrismaClient;

const activeWorkHospitalWhere = (actor: ActorContext): Prisma.HospitalWhereInput => {
  const scopes: Prisma.HospitalWhereInput[] = [];
  if (actor.roles.includes(Role.HOSPITAL)) scopes.push({ memberships: { some: { userId: actor.userId, status: MembershipStatus.ACTIVE, user: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } } } });
  if (actor.roles.includes(Role.OSM)) scopes.push({ osmHospitalRelationships: { some: { userId: actor.userId, status: MembershipStatus.ACTIVE, user: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.OSM } } } } } });
  return { status: HospitalStatus.ACTIVE, OR: scopes };
};

function assertWorkActor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || (!actor.roles.includes(Role.HOSPITAL) && !actor.roles.includes(Role.OSM))) throw new ForbiddenError();
}

const hospitalSelect = { hospitalCode: true, name: true } satisfies Prisma.HospitalSelect;
const contentSelect = {
  id: true, title: true, body: true, category: true, sourceText: true,
  firstPublishedAt: true, latestPublishedAt: true,
  hospital: { select: hospitalSelect },
  images: { select: { id: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
} satisfies Prisma.HospitalContentSelect;

type ContentRecord = Prisma.HospitalContentGetPayload<{ select: typeof contentSelect }>;

function publishedAt(row: ContentRecord): string {
  if (!row.latestPublishedAt || !row.firstPublishedAt) throw new InfrastructureError();
  return row.latestPublishedAt.toISOString();
}

function toListItem(row: ContentRecord): HospitalContentPatientListItem {
  return { id: row.id, hospital: row.hospital, title: row.title, category: row.category, latestPublishedAt: publishedAt(row), imageIds: row.images.map(({ id }) => id) };
}

const workContentRequestSchema = z.object({
  cursor: z.string().optional(),
  hospitalId: hospitalContentLocatorSchema.optional(),
  limit: z.number().int().min(1).max(HOSPITAL_CONTENT_PAGE_SIZE).optional(),
}).strict();

export async function listHospitalWorkContent(actor: ActorContext | null | undefined, input: { cursor?: string; hospitalId?: string; limit?: number } = {}, database: Database = getPrisma()): Promise<{ items: HospitalContentPatientListItem[]; nextCursor: string | null }> {
  assertWorkActor(actor);
  const request = workContentRequestSchema.safeParse(input);
  if (!request.success) throw new ValidationError("Hospital work content request is invalid");
  const hospitalId = request.data.hospitalId ?? null;
  const pageSize = request.data.limit ?? HOSPITAL_CONTENT_PAGE_SIZE;
  const cursor = request.data.cursor === undefined ? null : decodeHospitalContentWorkCursor(actor, hospitalId, request.data.cursor);
  try {
    const user = await database.user.findFirst({ where: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: { in: [Role.HOSPITAL, Role.OSM] } } } }, select: { id: true } });
    if (!user) throw new ForbiddenError();
    const rows = await database.hospitalContent.findMany({
      where: {
        status: HospitalContentStatus.PUBLISHED,
        firstPublishedAt: { not: null },
        latestPublishedAt: { not: null },
        // The optional Hospital locator only narrows the authorized predicate; it never widens it.
        hospital: { is: hospitalId === null ? activeWorkHospitalWhere(actor) : { AND: [activeWorkHospitalWhere(actor), { id: hospitalId }] } },
        ...(cursor ? { OR: [
          { latestPublishedAt: { lt: new Date(cursor.latestPublishedAt) } },
          { latestPublishedAt: new Date(cursor.latestPublishedAt), id: { lt: cursor.id } },
        ] } : {}),
      },
      orderBy: [{ latestPublishedAt: "desc" }, { id: "desc" }], take: pageSize + 1, select: contentSelect,
    });
    const pageRows = rows.slice(0, pageSize);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(toListItem),
      nextCursor: rows.length > pageSize && last?.latestPublishedAt
        ? encodeHospitalContentWorkCursor(actor, { version: 1, hospitalId, latestPublishedAt: last.latestPublishedAt.toISOString(), id: last.id })
        : null,
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) throw error;
    throw new InfrastructureError("Hospital work content could not be loaded");
  }
}

export async function getHospitalWorkContent(actor: ActorContext | null | undefined, contentId: unknown, database: Database = getPrisma()): Promise<HospitalContentPatientDetail> {
  assertWorkActor(actor);
  const parsed = hospitalContentLocatorSchema.safeParse(contentId);
  if (!parsed.success) throw new NotFoundError();
  try {
    const row = await database.hospitalContent.findFirst({ where: { id: parsed.data, status: HospitalContentStatus.PUBLISHED, firstPublishedAt: { not: null }, latestPublishedAt: { not: null }, hospital: { is: activeWorkHospitalWhere(actor) } }, select: contentSelect });
    if (!row) throw new NotFoundError();
    return { ...toListItem(row), body: row.body, sourceText: row.sourceText };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) throw error;
    throw new InfrastructureError("Hospital work content could not be loaded");
  }
}

export const hospitalContentWorkQueryInternals = { activeWorkHospitalWhere, assertWorkActor, contentSelect, toListItem };
