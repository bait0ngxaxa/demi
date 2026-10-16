import "server-only";

import { randomUUID } from "node:crypto";
import { HospitalStatus, MembershipStatus, MembershipType, Prisma, Role, SupportReportCategory, SupportReportStatus, UserStatus, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { supportReportCreateSchema, supportReportInboxQuerySchema, supportReportLocatorSchema, supportReportStatusSchema } from "../schemas/support-report-schemas";
import { decodeSupportReportCursor, encodeSupportReportCursor } from "./support-report-cursor";

type Database = PrismaClient;
export const SUPPORT_REPORTS_PER_BANGKOK_DAY = 5;
export const SUPPORT_REPORT_INBOX_PAGE_SIZE = 25;
export class SupportReportRateLimitError extends ConflictError {
  constructor() { super("Daily support report limit reached"); this.name = "SupportReportRateLimitError"; }
}

function activeRoleScope(actor: ActorContext): Prisma.HospitalWhereInput[] {
  const scopes: Prisma.HospitalWhereInput[] = [];
  const patientUser: Prisma.UserWhereInput = { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.PATIENT } } };
  const hospitalUser: Prisma.UserWhereInput = { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } };
  const osmUser: Prisma.UserWhereInput = { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.OSM } } };
  if (actor.roles.includes(Role.PATIENT)) {
    const patientScope: Prisma.HospitalWhereInput = {
      patientRelationships: {
        some: {
          ...activePatientHospitalRelationshipWhere,
          patientProfile: {
            is: {
              person: {
                is: { user: { is: patientUser } },
              },
            },
          },
        },
      },
    };
    scopes.push(patientScope);
  }
  if (actor.roles.includes(Role.HOSPITAL)) {
    scopes.push({ memberships: { some: { userId: actor.userId, status: MembershipStatus.ACTIVE, user: { is: hospitalUser } } } });
  }
  if (actor.roles.includes(Role.OSM)) {
    scopes.push({ osmHospitalRelationships: { some: { userId: actor.userId, status: MembershipStatus.ACTIVE, user: { is: osmUser } } } });
  }
  return scopes;
}

function assertActor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || activeRoleScope(actor).length === 0) throw new ForbiddenError();
}

export async function listOwnSupportHospitals(actor: ActorContext | null | undefined, database: Database = getPrisma()): Promise<Array<{ id: string; name: string; hospitalCode: string }>> {
  assertActor(actor);
  const hospitals = await database.hospital.findMany({ where: { status: HospitalStatus.ACTIVE, OR: activeRoleScope(actor) }, orderBy: [{ name: "asc" }, { hospitalCode: "asc" }], select: { id: true, name: true, hospitalCode: true } });
  return hospitals;
}

function bangkokDayStart(now: Date): Date {
  const carrier = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  carrier.setUTCHours(0, 0, 0, 0);
  return new Date(carrier.getTime() - 7 * 60 * 60 * 1000);
}

async function assertCurrentActor(actor: ActorContext, transaction: Prisma.TransactionClient): Promise<void> {
  const user = await transaction.user.findFirst({ where: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: { in: [Role.PATIENT, Role.OSM, Role.HOSPITAL] } } } }, select: { id: true } });
  if (!user) throw new ForbiddenError();
}

export async function createSupportReport(actor: ActorContext | null | undefined, input: unknown, dependencies: { database?: Database; now?: () => Date; idFactory?: () => string } = {}): Promise<{ id: string; createdAt: string }> {
  assertActor(actor);
  const parsed = supportReportCreateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Support report input is invalid");
  const database = dependencies.database ?? getPrisma();
  const now = new Date((dependencies.now?.() ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  const id = dependencies.idFactory?.() ?? randomUUID();
  try {
    return await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId}::uuid FOR UPDATE`;
      await assertCurrentActor(actor, transaction);
      const hospital = await transaction.hospital.findFirst({ where: { id: parsed.data.hospitalId, status: HospitalStatus.ACTIVE, OR: activeRoleScope(actor) }, select: { id: true } });
      if (!hospital) throw new ForbiddenError();
      const count = await transaction.supportReport.count({ where: { reporterUserId: actor.userId, createdAt: { gte: bangkokDayStart(now) } } });
      if (count >= SUPPORT_REPORTS_PER_BANGKOK_DAY) throw new SupportReportRateLimitError();
      const report = await transaction.supportReport.create({ data: { id, hospitalId: hospital.id, reporterUserId: actor.userId, category: parsed.data.category, message: parsed.data.message, status: SupportReportStatus.NEW, createdAt: now, updatedAt: now }, select: { id: true, createdAt: true } });
      await recordAuditEvent({ actorUserId: actor.userId, action: "support_report.created", resourceType: "SupportReport", resourceId: report.id, metadata: { hospitalId: hospital.id, category: parsed.data.category } }, transaction);
      return { id: report.id, createdAt: report.createdAt.toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ConflictError || error instanceof ValidationError || error instanceof InfrastructureError) throw error;
    throw new InfrastructureError("Support report could not be saved");
  }
}

function activeOwnerHospitalScope(actor: ActorContext): Prisma.HospitalWhereInput {
  return { status: HospitalStatus.ACTIVE, memberships: { some: { userId: actor.userId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE, user: { personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } } } };
}

function ownerHospitalWhere(actor: ActorContext, hospitalId: string): Prisma.HospitalWhereInput {
  return { id: hospitalId, ...activeOwnerHospitalScope(actor) };
}

export async function listOwnerSupportHospitals(actor: ActorContext | null | undefined, database: Database = getPrisma()): Promise<Array<{ id: string; name: string; hospitalCode: string }>> {
  assertOwner(actor);
  return database.hospital.findMany({ where: activeOwnerHospitalScope(actor), orderBy: [{ name: "asc" }, { hospitalCode: "asc" }], select: { id: true, name: true, hospitalCode: true } });
}

function assertOwner(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.roles.includes(Role.HOSPITAL) || !actor.hospitalMemberships.some(({ membershipType, status, hospitalStatus }) => membershipType === MembershipType.OWNER && status === MembershipStatus.ACTIVE && hospitalStatus === HospitalStatus.ACTIVE)) throw new ForbiddenError();
}

export async function listOwnerSupportReports(actor: ActorContext | null | undefined, input: unknown, database: Database = getPrisma()): Promise<{ hospital: { id: string; name: string; hospitalCode: string }; items: Array<{ id: string; category: SupportReportCategory; status: SupportReportStatus; createdAt: string; updatedAt: string }>; nextCursor: string | null }> {
  assertOwner(actor);
  const parsed = supportReportInboxQuerySchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  const hospital = await database.hospital.findFirst({ where: ownerHospitalWhere(actor, parsed.data.hospitalId), select: { id: true, name: true, hospitalCode: true } });
  if (!hospital) throw new NotFoundError();
  const cursor = parsed.data.cursor === undefined ? null : decodeSupportReportCursor(actor, hospital.id, parsed.data.cursor);
  const rows = await database.supportReport.findMany({
    where: {
      hospitalId: hospital.id,
      hospital: { is: activeOwnerHospitalScope(actor) },
      ...(cursor ? { OR: [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
      ] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: SUPPORT_REPORT_INBOX_PAGE_SIZE + 1,
    select: { id: true, category: true, status: true, createdAt: true, updatedAt: true },
  });
  const pageRows = rows.slice(0, SUPPORT_REPORT_INBOX_PAGE_SIZE);
  const last = pageRows.at(-1);
  return {
    hospital,
    items: pageRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    nextCursor: rows.length > SUPPORT_REPORT_INBOX_PAGE_SIZE && last
      ? encodeSupportReportCursor(actor, hospital.id, { version: 1, createdAt: last.createdAt.toISOString(), id: last.id })
      : null,
  };
}

export async function getOwnerSupportReport(actor: ActorContext | null | undefined, reportIdInput: unknown, database: Database = getPrisma()): Promise<{ id: string; hospitalId: string; hospital: { name: string; hospitalCode: string }; category: SupportReportCategory; message: string; status: SupportReportStatus; createdAt: string; updatedAt: string }> {
  assertOwner(actor);
  const parsed = supportReportLocatorSchema.safeParse(reportIdInput);
  if (!parsed.success) throw new NotFoundError();
  const row = await database.supportReport.findFirst({ where: { id: parsed.data, hospital: { is: activeOwnerHospitalScope(actor) } }, select: { id: true, hospitalId: true, category: true, message: true, status: true, createdAt: true, updatedAt: true, hospital: { select: { name: true, hospitalCode: true } } } });
  if (!row) throw new NotFoundError();
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function updateOwnerSupportReportStatus(actor: ActorContext | null | undefined, input: unknown, dependencies: { database?: Database; now?: () => Date } = {}): Promise<{ status: SupportReportStatus; updatedAt: string }> {
  assertOwner(actor);
  const parsed = supportReportStatusSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const database = dependencies.database ?? getPrisma();
  const now = new Date((dependencies.now?.() ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  try {
    return await database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ id: string; hospitalId: string; status: SupportReportStatus; updatedAt: Date }>>(Prisma.sql`SELECT r."id", r."hospitalId", r."status", r."updatedAt" FROM "SupportReport" r JOIN "HospitalMembership" m ON m."hospitalId" = r."hospitalId" AND m."userId" = ${actor.userId}::uuid AND m."membershipType" = 'OWNER'::"MembershipType" AND m."status" = 'ACTIVE'::"MembershipStatus" JOIN "Hospital" h ON h."id" = m."hospitalId" AND h."status" = 'ACTIVE'::"HospitalStatus" JOIN "User" u ON u."id" = m."userId" AND u."personId" = ${actor.personId}::uuid AND u."status" = 'ACTIVE'::"UserStatus" JOIN "UserRole" role ON role."userId" = u."id" AND role."role" = 'HOSPITAL'::"Role" WHERE r."id" = ${parsed.data.reportId}::uuid FOR UPDATE OF r`);
      const current = rows[0];
      if (!current) throw new NotFoundError();
      if (current.updatedAt.getTime() !== new Date(parsed.data.expectedUpdatedAt).getTime()) throw new ConflictError();
      if (current.status === SupportReportStatus.RESOLVED || (current.status === SupportReportStatus.NEW && parsed.data.status !== SupportReportStatus.ACKNOWLEDGED) || (current.status === SupportReportStatus.ACKNOWLEDGED && parsed.data.status !== SupportReportStatus.RESOLVED)) throw new ConflictError("Invalid support report status transition");
      const updatedAt = new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1));
      const update = await transaction.supportReport.updateMany({ where: { id: current.id, status: current.status, updatedAt: current.updatedAt }, data: { status: parsed.data.status, statusUpdaterUserId: actor.userId, resolvedAt: parsed.data.status === SupportReportStatus.RESOLVED ? updatedAt : null, updatedAt } });
      if (update.count !== 1) throw new ConflictError();
      await recordAuditEvent({ actorUserId: actor.userId, action: parsed.data.status === SupportReportStatus.ACKNOWLEDGED ? "support_report.acknowledged" : "support_report.resolved", resourceType: "SupportReport", resourceId: current.id, metadata: { hospitalId: current.hospitalId, fromStatus: current.status, toStatus: parsed.data.status } }, transaction);
      return { status: parsed.data.status, updatedAt: updatedAt.toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ConflictError || error instanceof NotFoundError || error instanceof ValidationError || error instanceof InfrastructureError) throw error;
    throw new InfrastructureError("Support report status could not be updated");
  }
}

export const supportReportInternals = { activeRoleScope, bangkokDayStart, activeOwnerHospitalScope, ownerHospitalWhere, assertOwner };
