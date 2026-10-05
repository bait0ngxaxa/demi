import "server-only";

import { HospitalContentStatus, HospitalStatus, Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";
import { HOSPITAL_CONTENT_CURSOR_LOOKAHEAD, HOSPITAL_CONTENT_PAGE_SIZE } from "../domain/hospital-content";
import { assertHospitalContentPolicy, HOSPITAL_CONTENT_CAPABILITIES } from "../policies/hospital-content-policy";
import { hospitalContentLocatorSchema } from "../schemas/hospital-content-schemas";
import { parseHospitalContentPatientRequest } from "../schemas/hospital-content-patient-schemas";
import type { HospitalContentPatientDetail, HospitalContentPatientEmptyState, HospitalContentPatientPage } from "../types/hospital-content-patient-projections";
import { decodeHospitalContentPatientCursor, encodeHospitalContentPatientCursor } from "./hospital-content-patient-cursor";
import { hospitalContentPatientPersonWhere, resolveHospitalContentPatientSelf } from "./hospital-content-patient-self";

export function hospitalContentPatientWhere(actor: ActorContext, patientProfileId: string): Prisma.HospitalContentWhereInput {
  return {
    status: HospitalContentStatus.PUBLISHED,
    firstPublishedAt: { not: null },
    latestPublishedAt: { not: null },
    hospital: { is: {
      status: HospitalStatus.ACTIVE,
      patientRelationships: { some: {
        patientProfile: { is: {
          id: patientProfileId,
          person: { is: hospitalContentPatientPersonWhere(actor) },
        } },
      } },
    } },
  };
}

const hospitalSelect = { hospitalCode: true, name: true } satisfies Prisma.HospitalSelect;
const listSelect = {
  id: true, title: true, category: true, latestPublishedAt: true, firstPublishedAt: true,
  hospital: { select: hospitalSelect },
} satisfies Prisma.HospitalContentSelect;
const detailSelect = {
  id: true, title: true, body: true, category: true, sourceText: true, latestPublishedAt: true,
  hospital: { select: hospitalSelect },
} satisfies Prisma.HospitalContentSelect;

function publicationInstant(value: Date | null): string {
  if (value === null || !Number.isFinite(value.getTime())) throw new InfrastructureError("Patient Content publication is unavailable");
  return value.toISOString();
}

async function classifyEmpty(
  actor: ActorContext,
  category: HospitalContentPatientPage["category"],
  database: PrismaClient,
): Promise<HospitalContentPatientEmptyState> {
  const current = await resolveHospitalContentPatientSelf(actor, database);
  if (!current.hasEligibleHospital) return "EMPTY_A";
  if (category === null) return "EMPTY_B";
  // This bounded existence SELECT also carries the entire persisted authorization predicate.
  const other = await database.hospitalContent.findFirst({
    where: hospitalContentPatientWhere(actor, current.patientProfileId), select: { id: true },
  });
  if (other) return "EMPTY_C";
  const rechecked = await resolveHospitalContentPatientSelf(actor, database);
  return rechecked.hasEligibleHospital ? "EMPTY_B" : "EMPTY_A";
}

export async function listPatientHospitalContent(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: PrismaClient = getPrisma(),
): Promise<HospitalContentPatientPage> {
  assertHospitalContentPolicy({ actor, capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "PATIENT_SELF_RELATIONSHIP" });
  if (!actor) throw new ForbiddenError();
  const request = parseHospitalContentPatientRequest(input);
  const category = request.category ?? null;
  try {
    const self = await resolveHospitalContentPatientSelf(actor, database);
    const cursor = request.cursor === undefined ? null : decodeHospitalContentPatientCursor(actor, self.patientProfileId, category, request.cursor);
    // No precomputed Hospital list, no cursor-anchor lookup, no payload read before authorization.
    const rows = await database.hospitalContent.findMany({
      where: {
        ...hospitalContentPatientWhere(actor, self.patientProfileId),
        ...(category === null ? {} : { category }),
        ...(cursor === null ? {} : { OR: [
          { firstPublishedAt: { lt: new Date(cursor.firstPublishedAt) } },
          { firstPublishedAt: new Date(cursor.firstPublishedAt), id: { lt: cursor.id } },
        ] }),
      },
      orderBy: [{ firstPublishedAt: "desc" }, { id: "desc" }],
      take: HOSPITAL_CONTENT_CURSOR_LOOKAHEAD,
      select: listSelect,
    });
    const visible = rows.slice(0, HOSPITAL_CONTENT_PAGE_SIZE);
    const last = visible.at(-1);
    const nextCursor = rows.length > HOSPITAL_CONTENT_PAGE_SIZE && last
      ? encodeHospitalContentPatientCursor(actor, self.patientProfileId, {
        version: 1, category, firstPublishedAt: publicationInstant(last.firstPublishedAt), id: last.id,
      }) : null;
    return {
      category,
      items: visible.map((row) => ({
        id: row.id, hospital: { hospitalCode: row.hospital.hospitalCode, name: row.hospital.name },
        title: row.title, category: row.category, latestPublishedAt: publicationInstant(row.latestPublishedAt),
      })),
      nextCursor,
      emptyState: rows.length === 0 ? await classifyEmpty(actor, category, database) : null,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Patient Content could not be loaded");
  }
}

export async function getPatientHospitalContent(
  actor: ActorContext | null | undefined,
  contentId: unknown,
  database: PrismaClient = getPrisma(),
): Promise<HospitalContentPatientDetail> {
  assertHospitalContentPolicy({ actor, capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "PATIENT_SELF_RELATIONSHIP" });
  if (!actor) throw new ForbiddenError();
  const parsed = hospitalContentLocatorSchema.safeParse(contentId);
  if (!parsed.success) throw new NotFoundError();
  try {
    const self = await resolveHospitalContentPatientSelf(actor, database);
    const row = await database.hospitalContent.findFirst({
      where: { ...hospitalContentPatientWhere(actor, self.patientProfileId), id: parsed.data },
      select: detailSelect,
    });
    if (!row) {
      await resolveHospitalContentPatientSelf(actor, database);
      throw new NotFoundError();
    }
    return {
      id: row.id, hospital: { hospitalCode: row.hospital.hospitalCode, name: row.hospital.name },
      title: row.title, body: row.body, category: row.category, sourceText: row.sourceText,
      latestPublishedAt: publicationInstant(row.latestPublishedAt),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Patient Content could not be loaded");
  }
}
