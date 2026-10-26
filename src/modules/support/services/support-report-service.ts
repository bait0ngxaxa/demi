import "server-only";

import { randomUUID } from "node:crypto";
import { HospitalStatus, MembershipStatus, Prisma, Role, SupportReportCategory, SupportReportStatus, UserStatus, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { assertPlatformAdminInDatabase } from "@/modules/hospital-governance/services/hospital-governance-service";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { canSubmitSupportReport, SUPPORT_REPORT_INBOX_ALL_STATUSES, SUPPORT_REPORT_SUBMITTER_ROLES, type SupportReportInboxStatus } from "../domain/support-report";
import { supportReportAdminInboxQuerySchema, supportReportCreateSchema, supportReportLocatorSchema, supportReportReporterHistoryQuerySchema, supportReportStatusSchema } from "../schemas/support-report-schemas";
import { decodeSupportReportCursor, encodeSupportReportCursor, type SupportReportCursor } from "./support-report-cursor";

type Database = PrismaClient;
export const SUPPORT_REPORTS_PER_BANGKOK_DAY = 5;
export const SUPPORT_REPORT_PAGE_SIZE = 25;
export class SupportReportRateLimitError extends ConflictError {
  constructor() { super("Daily support report limit reached"); this.name = "SupportReportRateLimitError"; }
}

export type SupportReportListItem = { id: string; category: SupportReportCategory; status: SupportReportStatus; createdAt: string; updatedAt: string; resolvedAt: string | null; hospitalName: string | null };
export type SupportReportPage = { items: SupportReportListItem[]; nextCursor: string | null };
export type SupportReportDetail = SupportReportListItem & { message: string; hospital: { id: string; name: string; hospitalCode: string } | null };

/**
 * Hospitals a reporter may name as optional context. CAREGIVER has no general Hospital scope (its only Hospital link is a
 * Patient's appointment-read grant), so a CAREGIVER-only account reports without a Hospital.
 */
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

function assertSubmitter(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !canSubmitSupportReport(actor.roles)) throw new ForbiddenError();
}

export async function listOwnSupportHospitals(actor: ActorContext | null | undefined, database: Database = getPrisma()): Promise<Array<{ id: string; name: string; hospitalCode: string }>> {
  assertSubmitter(actor);
  const scopes = activeRoleScope(actor);
  if (scopes.length === 0) return [];
  return database.hospital.findMany({ where: { status: HospitalStatus.ACTIVE, OR: scopes }, orderBy: [{ name: "asc" }, { hospitalCode: "asc" }], select: { id: true, name: true, hospitalCode: true } });
}

function bangkokDayStart(now: Date): Date {
  const carrier = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  carrier.setUTCHours(0, 0, 0, 0);
  return new Date(carrier.getTime() - 7 * 60 * 60 * 1000);
}

/** The persisted User decides: ACTIVE, holding a submitter role, and never ADMIN (an ADMIN would report to itself). */
async function assertCurrentSubmitter(actor: ActorContext, transaction: Prisma.TransactionClient): Promise<void> {
  const user = await transaction.user.findFirst({
    where: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE, roles: { some: { role: { in: [...SUPPORT_REPORT_SUBMITTER_ROLES] } }, none: { role: Role.ADMIN } } },
    select: { id: true },
  });
  if (!user) throw new ForbiddenError();
}

export async function createSupportReport(actor: ActorContext | null | undefined, input: unknown, dependencies: { database?: Database; now?: () => Date; idFactory?: () => string } = {}): Promise<{ id: string; createdAt: string }> {
  assertSubmitter(actor);
  const parsed = supportReportCreateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Support report input is invalid");
  const database = dependencies.database ?? getPrisma();
  const now = new Date((dependencies.now?.() ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  const id = dependencies.idFactory?.() ?? randomUUID();
  const requestedHospitalId = parsed.data.hospitalId;
  try {
    return await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId}::uuid FOR UPDATE`;
      await assertCurrentSubmitter(actor, transaction);
      let hospitalId: string | null = null;
      if (requestedHospitalId !== undefined) {
        const scopes = activeRoleScope(actor);
        const hospital = scopes.length === 0 ? null : await transaction.hospital.findFirst({ where: { id: requestedHospitalId, status: HospitalStatus.ACTIVE, OR: scopes }, select: { id: true } });
        if (!hospital) throw new ForbiddenError();
        hospitalId = hospital.id;
      }
      const count = await transaction.supportReport.count({ where: { reporterUserId: actor.userId, createdAt: { gte: bangkokDayStart(now) } } });
      if (count >= SUPPORT_REPORTS_PER_BANGKOK_DAY) throw new SupportReportRateLimitError();
      const report = await transaction.supportReport.create({ data: { id, hospitalId, reporterUserId: actor.userId, category: parsed.data.category, message: parsed.data.message, status: SupportReportStatus.NEW, createdAt: now, updatedAt: now }, select: { id: true, createdAt: true } });
      await recordAuditEvent({ actorUserId: actor.userId, action: "support_report.created", resourceType: "SupportReport", resourceId: report.id, metadata: { hospitalId, category: parsed.data.category } }, transaction);
      return { id: report.id, createdAt: report.createdAt.toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ConflictError || error instanceof ValidationError || error instanceof InfrastructureError) throw error;
    throw new InfrastructureError("Support report could not be saved");
  }
}

const listItemSelect = { id: true, category: true, status: true, createdAt: true, updatedAt: true, resolvedAt: true, hospital: { select: { name: true } } } satisfies Prisma.SupportReportSelect;
type ListItemRow = Prisma.SupportReportGetPayload<{ select: typeof listItemSelect }>;

function toListItem(row: ListItemRow): SupportReportListItem {
  return { id: row.id, category: row.category, status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, hospitalName: row.hospital?.name ?? null };
}

function afterCursor(cursor: SupportReportCursor | null): Prisma.SupportReportWhereInput {
  return cursor ? { OR: [
    { createdAt: { lt: new Date(cursor.createdAt) } },
    { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
  ] } : {};
}

function toPage(actor: ActorContext, scope: string, rows: readonly ListItemRow[]): SupportReportPage {
  const pageRows = rows.slice(0, SUPPORT_REPORT_PAGE_SIZE);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(toListItem),
    nextCursor: rows.length > SUPPORT_REPORT_PAGE_SIZE && last
      ? encodeSupportReportCursor(actor, scope, { version: 1, createdAt: last.createdAt.toISOString(), id: last.id })
      : null,
  };
}

const REPORTER_HISTORY_SCOPE = "reporter-history";

/** D4: a reporter reads only their own reports. The relation filter re-checks the persisted, ACTIVE reporter. */
function ownReportsWhere(actor: ActorContext): Prisma.SupportReportWhereInput {
  return { reporterUserId: actor.userId, reporter: { is: { id: actor.userId, personId: actor.personId, status: UserStatus.ACTIVE } } };
}

export async function listOwnSupportReports(actor: ActorContext | null | undefined, input: unknown, database: Database = getPrisma()): Promise<SupportReportPage> {
  if (!actor) throw new ForbiddenError();
  const parsed = supportReportReporterHistoryQuerySchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Support report history query is invalid");
  const cursor = parsed.data.cursor === undefined ? null : decodeSupportReportCursor(actor, REPORTER_HISTORY_SCOPE, parsed.data.cursor);
  const rows = await database.supportReport.findMany({
    where: { ...ownReportsWhere(actor), ...afterCursor(cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: SUPPORT_REPORT_PAGE_SIZE + 1,
    select: listItemSelect,
  });
  return toPage(actor, REPORTER_HISTORY_SCOPE, rows);
}

const detailSelect = { ...listItemSelect, message: true, hospital: { select: { id: true, name: true, hospitalCode: true } } } satisfies Prisma.SupportReportSelect;

function toDetail(row: Prisma.SupportReportGetPayload<{ select: typeof detailSelect }>): SupportReportDetail {
  return { ...toListItem(row), message: row.message, hospital: row.hospital };
}

/** Another user's report is indistinguishable from a missing one. */
export async function getOwnSupportReport(actor: ActorContext | null | undefined, reportIdInput: unknown, database: Database = getPrisma()): Promise<SupportReportDetail> {
  if (!actor) throw new ForbiddenError();
  const parsed = supportReportLocatorSchema.safeParse(reportIdInput);
  if (!parsed.success) throw new NotFoundError();
  const row = await database.supportReport.findFirst({ where: { id: parsed.data, ...ownReportsWhere(actor) }, select: detailSelect });
  if (!row) throw new NotFoundError();
  return toDetail(row);
}

/** Session hint only; `assertPlatformAdminInDatabase` decides inside each transaction. */
function assertAdmin(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.roles.includes(Role.ADMIN)) throw new ForbiddenError();
}

export type SupportReportAdminInboxPage = SupportReportPage & { status: SupportReportInboxStatus };

export async function listAdminSupportReports(actor: ActorContext | null | undefined, input: unknown, database: Database = getPrisma()): Promise<SupportReportAdminInboxPage> {
  assertAdmin(actor);
  const parsed = supportReportAdminInboxQuerySchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Support report inbox query is invalid");
  const { status, category, hospitalId } = parsed.data;
  // The cursor is bound to the exact resolved filter set: a default NEW page cannot continue the ALL view, nor the reverse.
  const scope = `admin-inbox:status=${status}:category=${category ?? "*"}:hospital=${hospitalId?.toLowerCase() ?? "*"}`;
  const cursor = parsed.data.cursor === undefined ? null : decodeSupportReportCursor(actor, scope, parsed.data.cursor);
  const rows = await database.$transaction(async (transaction) => {
    await assertPlatformAdminInDatabase(transaction, actor.userId);
    return transaction.supportReport.findMany({
      where: { ...(status === SUPPORT_REPORT_INBOX_ALL_STATUSES ? {} : { status }), ...(category ? { category } : {}), ...(hospitalId ? { hospitalId } : {}), ...afterCursor(cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: SUPPORT_REPORT_PAGE_SIZE + 1,
      select: listItemSelect,
    });
  });
  return { ...toPage(actor, scope, rows), status };
}

/** WB-DF-14 P2 (Product Owner 2026-10-26): the ADMIN detail alone names the reporter and their current persisted roles. */
export type SupportReportAdminDetail = SupportReportDetail & { reporter: { displayName: string; roles: Role[] } };

const adminDetailSelect = {
  ...detailSelect,
  reporter: { select: { person: { select: { givenName: true, familyName: true } }, roles: { select: { role: true }, orderBy: { role: "asc" } } } },
} satisfies Prisma.SupportReportSelect;

function displayNameOf(person: { givenName: string | null; familyName: string | null }): string {
  return `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() || "ไม่พบชื่อผู้ใช้";
}

export async function getAdminSupportReport(actor: ActorContext | null | undefined, reportIdInput: unknown, database: Database = getPrisma()): Promise<SupportReportAdminDetail> {
  assertAdmin(actor);
  const parsed = supportReportLocatorSchema.safeParse(reportIdInput);
  if (!parsed.success) throw new NotFoundError();
  const row = await database.$transaction(async (transaction) => {
    await assertPlatformAdminInDatabase(transaction, actor.userId);
    return transaction.supportReport.findUnique({ where: { id: parsed.data }, select: adminDetailSelect });
  });
  if (!row) throw new NotFoundError();
  return { ...toDetail(row), reporter: { displayName: displayNameOf(row.reporter.person), roles: row.reporter.roles.map(({ role }) => role) } };
}

export async function updateAdminSupportReportStatus(actor: ActorContext | null | undefined, input: unknown, dependencies: { database?: Database; now?: () => Date } = {}): Promise<{ status: SupportReportStatus; updatedAt: string }> {
  assertAdmin(actor);
  const parsed = supportReportStatusSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const database = dependencies.database ?? getPrisma();
  const now = new Date((dependencies.now?.() ?? new Date()).getTime());
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  try {
    return await database.$transaction(async (transaction) => {
      await assertPlatformAdminInDatabase(transaction, actor.userId);
      const rows = await transaction.$queryRaw<Array<{ id: string; hospitalId: string | null; status: SupportReportStatus; updatedAt: Date }>>(Prisma.sql`SELECT r."id", r."hospitalId", r."status", r."updatedAt" FROM "SupportReport" r WHERE r."id" = ${parsed.data.reportId}::uuid FOR UPDATE OF r`);
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

export const supportReportInternals = { activeRoleScope, bangkokDayStart };
