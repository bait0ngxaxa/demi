import "server-only";

import { randomUUID } from "node:crypto";
import {
  HospitalContentCategory,
  HospitalContentStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import { decideHospitalContentMutation, type HospitalContentEditableFields } from "../domain/hospital-content-mutation";
import {
  HOSPITAL_CONTENT_CURSOR_LOOKAHEAD,
  HOSPITAL_CONTENT_PAGE_SIZE,
  hospitalContentPublicationTimes,
  nextHospitalContentVersion,
} from "../domain/hospital-content";
import { assertHospitalContentPolicy, HOSPITAL_CONTENT_CAPABILITIES } from "../policies/hospital-content-policy";
import {
  hospitalContentArchiveSchema,
  hospitalContentCreateSchema,
  hospitalContentEditSchema,
  hospitalContentLocatorSchema,
  hospitalContentPublishSchema,
  hospitalContentReconcileSchema,
  hospitalContentWithdrawSchema,
} from "../schemas/hospital-content-schemas";
import {
  decodeHospitalContentCursor,
  encodeHospitalContentCursor,
  type HospitalContentCursor,
} from "./hospital-content-cursor";
import type {
  HospitalContentCreateResult,
  HospitalContentDetailProjection,
  HospitalContentListProjection,
  HospitalContentListItem,
  HospitalContentMutationResult,
  HospitalContentOwnerHospital,
  HospitalContentReconciliationResult,
} from "../types/hospital-content-projections";
import {
  normalizeHospitalContentBody,
  normalizeHospitalContentSourceText,
  normalizeHospitalContentTitle,
} from "../schemas/hospital-content-schemas";

export type HospitalContentDatabase = PrismaClient;

export type HospitalContentServiceDependencies = {
  database?: HospitalContentDatabase;
  now?: () => Date;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const MAX_TRANSACTION_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [25, 50] as const;

const hospitalProjectionSelect = { id: true, hospitalCode: true, name: true } satisfies Prisma.HospitalSelect;

const detailSelect = {
  id: true,
  hospitalId: true,
  title: true,
  body: true,
  category: true,
  sourceText: true,
  status: true,
  firstPublishedAt: true,
  latestPublishedAt: true,
  updatedAt: true,
  hospital: { select: hospitalProjectionSelect },
} satisfies Prisma.HospitalContentSelect;

const listItemSelect = {
  id: true,
  title: true,
  category: true,
  status: true,
  firstPublishedAt: true,
  latestPublishedAt: true,
  updatedAt: true,
} satisfies Prisma.HospitalContentSelect;

type HospitalContentDetailRecord = Prisma.HospitalContentGetPayload<{ select: typeof detailSelect }>;
type HospitalContentListRecord = Prisma.HospitalContentGetPayload<{ select: typeof listItemSelect }>;
type LockedUserRow = { id: string; personId: string; status: UserStatus };
type LockedRoleRow = { userId: string; role: Role };
type LockedHospitalRow = { id: string; status: HospitalStatus };
type LockedMembershipRow = { id: string; membershipType: MembershipType; status: MembershipStatus };
type LockedContentRow = {
  id: string;
  hospitalId: string;
  title: string;
  body: string;
  category: HospitalContentCategory;
  sourceText: string | null;
  status: HospitalContentStatus;
  firstPublishedAt: Date | null;
  latestPublishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

class HospitalContentAuditFailure extends Error {
  constructor() {
    super("Hospital Content audit failed");
    this.name = "HospitalContentAuditFailure";
  }
}

function getDatabase(dependencies: HospitalContentServiceDependencies): HospitalContentDatabase {
  return dependencies.database ?? getPrisma();
}

function serverNow(dependencies: HospitalContentServiceDependencies): Date {
  const value = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new InfrastructureError("Hospital Content clock is invalid");
  return new Date(value.getTime());
}

function getActiveOwnerHospitalWhere(actor: ActorContext): Prisma.HospitalWhereInput {
  return {
    status: HospitalStatus.ACTIVE,
    memberships: {
      some: {
        userId: actor.userId,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          personId: actor.personId,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
    },
  };
}

function toDetailProjection(record: HospitalContentDetailRecord): HospitalContentDetailProjection {
  return {
    id: record.id,
    hospital: record.hospital,
    title: record.title,
    body: record.body,
    category: record.category,
    sourceText: record.sourceText,
    status: record.status,
    firstPublishedAt: record.firstPublishedAt?.toISOString() ?? null,
    latestPublishedAt: record.latestPublishedAt?.toISOString() ?? null,
    expectedUpdatedAt: record.updatedAt.toISOString(),
  };
}

function toListItem(record: HospitalContentListRecord): HospitalContentListItem {
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    status: record.status,
    firstPublishedAt: record.firstPublishedAt?.toISOString() ?? null,
    latestPublishedAt: record.latestPublishedAt?.toISOString() ?? null,
    expectedUpdatedAt: record.updatedAt.toISOString(),
  };
}

function isKnownPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function getPostgresSqlState(error: unknown, visited = new Set<object>()): string | null {
  if (typeof error !== "object" || error === null || visited.has(error)) return null;
  visited.add(error);
  const record = error as Record<string, unknown>;
  const direct = record.sqlState ?? record.code;
  if (direct === "40P01") return "40P01";
  if (typeof record.meta === "object" && record.meta !== null) {
    const meta = record.meta as Record<string, unknown>;
    if (meta.code === "40P01" || meta.sqlState === "40P01") return "40P01";
  }
  return getPostgresSqlState(record.cause, visited);
}

function isRetryableTransactionFailure(error: unknown): boolean {
  return isKnownPrismaError(error, "P2034") || getPostgresSqlState(error) === "40P01";
}

function expectedVersionMatches(expectedUpdatedAt: string, currentUpdatedAt: Date): boolean {
  return new Date(expectedUpdatedAt).getTime() === currentUpdatedAt.getTime();
}

async function lockAndRevalidateAuthority(
  actor: ActorContext,
  hospitalId: string,
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const users = await transaction.$queryRaw<LockedUserRow[]>(Prisma.sql`
    SELECT "id", "personId", "status"
    FROM "User"
    WHERE "id" = ${actor.userId}::uuid
    FOR SHARE
  `);
  const user = users[0];
  if (!user || user.status !== UserStatus.ACTIVE || user.personId !== actor.personId) throw new ForbiddenError();

  const roles = await transaction.$queryRaw<LockedRoleRow[]>(Prisma.sql`
    SELECT "userId", "role"
    FROM "UserRole"
    WHERE "userId" = ${actor.userId}::uuid AND "role" = ${Role.HOSPITAL}::"Role"
    FOR SHARE
  `);

  const hospitals = await transaction.$queryRaw<LockedHospitalRow[]>(Prisma.sql`
    SELECT "id", "status"
    FROM "Hospital"
    WHERE "id" = ${hospitalId}::uuid
    FOR SHARE
  `);
  const hospital = hospitals[0];

  const memberships = await transaction.$queryRaw<LockedMembershipRow[]>(Prisma.sql`
    SELECT "id", "membershipType", "status"
    FROM "HospitalMembership"
    WHERE "userId" = ${actor.userId}::uuid AND "hospitalId" = ${hospitalId}::uuid
    FOR SHARE
  `);
  const membership = memberships[0];

  const revalidated = await transaction.user.findFirst({
    where: {
      id: actor.userId,
      personId: actor.personId,
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.HOSPITAL } },
      memberships: {
        some: {
          hospitalId,
          membershipType: MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
          hospital: { status: HospitalStatus.ACTIVE },
        },
      },
    },
    select: { id: true },
  });

  if (
    roles.length !== 1 ||
    !hospital ||
    hospital.status !== HospitalStatus.ACTIVE ||
    !membership ||
    membership.membershipType !== MembershipType.OWNER ||
    membership.status !== MembershipStatus.ACTIVE ||
    !revalidated
  ) {
    throw new ForbiddenError();
  }
}

async function recordContentAudit(
  actorUserId: string,
  action: "hospital_content.created" | "hospital_content.updated" | "hospital_content.published" | "hospital_content.withdrawn" | "hospital_content.archived",
  contentId: string,
  hospitalId: string,
  transaction: Prisma.TransactionClient,
): Promise<void> {
  try {
    await recordAuditEvent({
      actorUserId,
      action,
      resourceType: "HospitalContent",
      resourceId: contentId,
      metadata: { hospitalId },
    }, transaction);
  } catch {
    throw new HospitalContentAuditFailure();
  }
}

async function readCurrentDetail(
  transaction: Prisma.TransactionClient,
  contentId: string,
  hospitalId: string,
): Promise<HospitalContentDetailProjection> {
  const current = await transaction.hospitalContent.findFirst({
    where: { id: contentId, hospitalId },
    select: detailSelect,
  });
  if (!current) throw new InfrastructureError("Hospital Content result could not be confirmed");
  return toDetailProjection(current);
}

function validateStoredContentForPublish(current: LockedContentRow): void {
  try {
    const title = normalizeHospitalContentTitle(current.title);
    const body = normalizeHospitalContentBody(current.body);
    const sourceText = normalizeHospitalContentSourceText(current.sourceText);
    if (title !== current.title || body !== current.body || sourceText !== current.sourceText) {
      throw new Error("Stored Hospital Content is not normalized");
    }
    if (!Object.values(HospitalContentCategory).includes(current.category)) {
      throw new Error("Stored Hospital Content category is invalid");
    }
  } catch {
    throw new InfrastructureError("Hospital Content cannot be published safely");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retryDelay(attempt: number, dependencies: HospitalContentServiceDependencies): Promise<void> {
  const maxDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const randomValue = dependencies.random?.() ?? Math.random();
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  await (dependencies.sleep ?? delay)(Math.round(boundedRandom * maxDelay));
}

export async function listEligibleHospitalContentOwnerHospitals(
  actor: ActorContext | null | undefined,
  database: HospitalContentDatabase = getPrisma(),
): Promise<HospitalContentOwnerHospital[]> {
  assertHospitalContentPolicy({ actor, capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER" });
  if (!actor) throw new ForbiddenError();
  try {
    return await database.hospital.findMany({
      where: getActiveOwnerHospitalWhere(actor),
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
      select: hospitalProjectionSelect,
    });
  } catch {
    throw new InfrastructureError("Hospital Content Hospitals could not be loaded");
  }
}

export async function readHospitalContentForOwner(
  actor: ActorContext | null | undefined,
  contentId: unknown,
  database: HospitalContentDatabase = getPrisma(),
): Promise<HospitalContentDetailProjection> {
  assertHospitalContentPolicy({ actor, capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER" });
  const parsedId = hospitalContentLocatorSchema.safeParse(contentId);
  if (!parsedId.success || !actor) throw new NotFoundError();
  try {
    const record = await database.hospitalContent.findFirst({
      where: {
        id: parsedId.data,
        hospital: { is: getActiveOwnerHospitalWhere(actor) },
      },
      select: detailSelect,
    });
    if (!record) throw new NotFoundError();
    return toDetailProjection(record);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) throw error;
    throw new InfrastructureError("Hospital Content could not be loaded");
  }
}

export async function listHospitalContentForOwner(
  actor: ActorContext | null | undefined,
  hospitalId: unknown,
  cursorInput?: unknown,
  database: HospitalContentDatabase = getPrisma(),
): Promise<HospitalContentListProjection> {
  const parsedHospitalId = hospitalContentLocatorSchema.safeParse(hospitalId);
  if (!parsedHospitalId.success) throw new NotFoundError();
  assertHospitalContentPolicy({ actor, capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: parsedHospitalId.data });
  if (!actor) throw new ForbiddenError();

  let cursor: HospitalContentCursor | undefined;
  if (cursorInput !== undefined && cursorInput !== null) {
    if (typeof cursorInput !== "string") throw new ValidationError("Hospital Content cursor is invalid");
    cursor = decodeHospitalContentCursor(actor, parsedHospitalId.data, cursorInput);
  }

  try {
    const hospital = await database.hospital.findFirst({
      where: { id: parsedHospitalId.data, ...getActiveOwnerHospitalWhere(actor) },
      select: {
        ...hospitalProjectionSelect,
        contents: {
          ...(cursor ? {
            where: {
              OR: [
                { updatedAt: { lt: new Date(cursor.updatedAt) } },
                { updatedAt: new Date(cursor.updatedAt), id: { lt: cursor.id } },
              ],
            },
          } : {}),
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: HOSPITAL_CONTENT_CURSOR_LOOKAHEAD,
          select: listItemSelect,
        },
      },
    });
    if (!hospital) throw new NotFoundError();
    const hasMore = hospital.contents.length > HOSPITAL_CONTENT_PAGE_SIZE;
    const rows = hospital.contents.slice(0, HOSPITAL_CONTENT_PAGE_SIZE);
    const last = rows.at(-1);
    return {
      hospital: { id: hospital.id, hospitalCode: hospital.hospitalCode, name: hospital.name },
      items: rows.map(toListItem),
      nextCursor: hasMore && last ? encodeHospitalContentCursor(actor, {
        version: 1,
        hospitalId: hospital.id,
        updatedAt: last.updatedAt.toISOString(),
        id: last.id,
      }) : null,
    };
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ValidationError) throw error;
    throw new InfrastructureError("Hospital Content list could not be loaded");
  }
}

export async function reconcileHospitalContentCreate(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: HospitalContentDatabase = getPrisma(),
): Promise<HospitalContentReconciliationResult> {
  const parsed = hospitalContentReconcileSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Hospital Content reconciliation request is invalid");
  assertHospitalContentPolicy({ actor, capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: parsed.data.hospitalId });
  if (!actor) throw new ForbiddenError();
  try {
    const hospital = await database.hospital.findFirst({
      where: { id: parsed.data.hospitalId, ...getActiveOwnerHospitalWhere(actor) },
      select: {
        contents: {
          where: { submissionNonce: parsed.data.submissionNonce },
          take: 1,
          select: detailSelect,
        },
      },
    });
    if (!hospital) throw new NotFoundError();
    const record = hospital.contents[0];
    return record ? { status: "FOUND", content: toDetailProjection(record) } : { status: "ABSENT" };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) throw error;
    throw new InfrastructureError("Hospital Content reconciliation could not be completed");
  }
}

async function createInTransaction(
  actor: ActorContext,
  fields: ReturnType<typeof hospitalContentCreateSchema.parse>,
  transaction: Prisma.TransactionClient,
  dependencies: HospitalContentServiceDependencies,
): Promise<HospitalContentCreateResult> {
  await lockAndRevalidateAuthority(actor, fields.hospitalId, transaction);
  const now = serverNow(dependencies);
  const createdId = randomUUID();
  const inserted = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "HospitalContent" (
      "id", "hospitalId", "submissionNonce", "title", "body", "category", "sourceText",
      "status", "firstPublishedAt", "latestPublishedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${createdId}::uuid, ${fields.hospitalId}::uuid, ${fields.submissionNonce}::uuid,
      ${fields.title}, ${fields.body}, ${fields.category}::"HospitalContentCategory", ${fields.sourceText},
      ${HospitalContentStatus.DRAFT}::"HospitalContentStatus", NULL, NULL, ${now}, ${now}
    )
    ON CONFLICT ("hospitalId", "submissionNonce") DO NOTHING
    RETURNING "id"
  `);

  if (inserted.length === 1) {
    await recordContentAudit(actor.userId, "hospital_content.created", createdId, fields.hospitalId, transaction);
    return { outcome: "CREATED", content: await readCurrentDetail(transaction, createdId, fields.hospitalId) };
  }

  // This later ReadCommitted statement sees the winner after the unique-key wait
  // and holds its current row stable while projecting the replay result.
  const existingRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "HospitalContent"
    WHERE "hospitalId" = ${fields.hospitalId}::uuid
      AND "submissionNonce" = ${fields.submissionNonce}::uuid
    FOR SHARE
  `);
  const existing = existingRows[0];
  if (!existing) throw new InfrastructureError("Hospital Content replay could not be confirmed");
  return {
    outcome: "REPLAY",
    content: await readCurrentDetail(transaction, existing.id, fields.hospitalId),
  };
}

export async function createHospitalContent(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: HospitalContentServiceDependencies = {},
): Promise<HospitalContentCreateResult> {
  const parsed = hospitalContentCreateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Hospital Content input is invalid");
  assertHospitalContentPolicy({ actor, capability: HOSPITAL_CONTENT_CAPABILITIES.manage, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: parsed.data.hospitalId });
  if (!actor) throw new ForbiddenError();
  const database = getDatabase(dependencies);

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let callbackCompleted = false;
    try {
      return await database.$transaction(async (transaction): Promise<HospitalContentCreateResult> => {
        const result = await createInTransaction(actor, parsed.data, transaction, dependencies);
        callbackCompleted = true;
        return result;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error: unknown) {
      if (error instanceof HospitalContentAuditFailure) throw new InfrastructureError("Hospital Content could not be saved");
      if (isRetryableTransactionFailure(error)) {
        if (attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) throw new ConflictError("Hospital Content changed during the operation");
        await retryDelay(attempt, dependencies);
        continue;
      }
      if (callbackCompleted) return { outcome: "UNCONFIRMED" };
      if (error instanceof ConflictError || error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof ValidationError || error instanceof InfrastructureError) throw error;
      throw new InfrastructureError("Hospital Content could not be saved");
    }
  }
  throw new ConflictError("Hospital Content changed during the operation");
}

async function mutateInTransaction(
  actor: ActorContext,
  command: "EDIT" | "PUBLISH" | "WITHDRAW" | "ARCHIVE",
  input: { contentId: string; expectedUpdatedAt: string; desired?: HospitalContentEditableFields },
  transaction: Prisma.TransactionClient,
  dependencies: HospitalContentServiceDependencies,
): Promise<HospitalContentMutationResult> {
  const locator = await transaction.hospitalContent.findUnique({ where: { id: input.contentId }, select: { hospitalId: true } });
  if (!locator) throw new NotFoundError();

  await lockAndRevalidateAuthority(actor, locator.hospitalId, transaction);
  const locked = await transaction.$queryRaw<LockedContentRow[]>(Prisma.sql`
    SELECT "id", "hospitalId", "title", "body", "category", "sourceText", "status",
      "firstPublishedAt", "latestPublishedAt", "createdAt", "updatedAt"
    FROM "HospitalContent"
    WHERE "id" = ${input.contentId}::uuid AND "hospitalId" = ${locator.hospitalId}::uuid
    FOR UPDATE
  `);
  const current = locked[0];
  if (!current || current.hospitalId !== locator.hospitalId) throw new NotFoundError();

  const decision = decideHospitalContentMutation({
    command,
    current,
    expectedUpdatedAt: input.expectedUpdatedAt,
    ...(input.desired ? { desired: input.desired } : {}),
  });
  if (decision === "CONFLICT") throw new ConflictError("Hospital Content changed before this action");
  if (decision === "NOOP") return { outcome: "NOOP", content: await readCurrentDetail(transaction, current.id, current.hospitalId) };

  const now = serverNow(dependencies);
  let updatedAt: Date;
  try {
    updatedAt = nextHospitalContentVersion(now, current.updatedAt);
  } catch {
    throw new InfrastructureError("Hospital Content clock is invalid");
  }

  let data: Prisma.HospitalContentUpdateManyMutationInput;
  let action: "hospital_content.updated" | "hospital_content.published" | "hospital_content.withdrawn" | "hospital_content.archived";

  if (command === "EDIT" && input.desired) {
    data = { ...input.desired, updatedAt };
    action = "hospital_content.updated";
  } else if (command === "PUBLISH") {
    validateStoredContentForPublish(current);
    let publicationTimes: ReturnType<typeof hospitalContentPublicationTimes>;
    try {
      publicationTimes = hospitalContentPublicationTimes(current.firstPublishedAt, current.latestPublishedAt, now);
    } catch {
      throw new InfrastructureError("Hospital Content publication clock is invalid");
    }
    data = { status: HospitalContentStatus.PUBLISHED, ...publicationTimes, updatedAt };
    action = "hospital_content.published";
  } else if (command === "WITHDRAW") {
    data = { status: HospitalContentStatus.DRAFT, updatedAt };
    action = "hospital_content.withdrawn";
  } else {
    data = { status: HospitalContentStatus.ARCHIVED, updatedAt };
    action = "hospital_content.archived";
  }

  const allowedStatuses = command === "EDIT" || command === "PUBLISH"
    ? [HospitalContentStatus.DRAFT]
    : command === "WITHDRAW"
      ? [HospitalContentStatus.PUBLISHED]
      : [HospitalContentStatus.DRAFT, HospitalContentStatus.PUBLISHED];
  const changed = await transaction.hospitalContent.updateMany({
    where: {
      id: current.id,
      hospitalId: current.hospitalId,
      updatedAt: current.updatedAt,
      status: { in: allowedStatuses },
    },
    data,
  });
  if (changed.count !== 1) throw new ConflictError("Hospital Content changed before this action");

  await recordContentAudit(actor.userId, action, current.id, current.hospitalId, transaction);
  return {
    outcome: decision,
    content: await readCurrentDetail(transaction, current.id, current.hospitalId),
  };
}

async function mutateHospitalContent(
  actor: ActorContext | null | undefined,
  command: "EDIT" | "PUBLISH" | "WITHDRAW" | "ARCHIVE",
  input: unknown,
  dependencies: HospitalContentServiceDependencies,
): Promise<HospitalContentMutationResult> {
  let contentId: string;
  let expectedUpdatedAt: string;
  let desired: HospitalContentEditableFields | undefined;
  if (command === "EDIT") {
    const parsed = hospitalContentEditSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("Hospital Content input is invalid");
    contentId = parsed.data.contentId;
    expectedUpdatedAt = parsed.data.expectedUpdatedAt;
    desired = { title: parsed.data.title, body: parsed.data.body, category: parsed.data.category, sourceText: parsed.data.sourceText };
  } else {
    const parsed = command === "PUBLISH"
      ? hospitalContentPublishSchema.safeParse(input)
      : command === "WITHDRAW"
        ? hospitalContentWithdrawSchema.safeParse(input)
        : hospitalContentArchiveSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("Hospital Content input is invalid");
    contentId = parsed.data.contentId;
    expectedUpdatedAt = parsed.data.expectedUpdatedAt;
  }
  assertHospitalContentPolicy({ actor, capability: HOSPITAL_CONTENT_CAPABILITIES.manage, scope: "DIRECT_HOSPITAL_OWNER" });
  if (!actor) throw new ForbiddenError();
  const database = getDatabase(dependencies);
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let callbackCompleted = false;
    try {
      return await database.$transaction(async (transaction): Promise<HospitalContentMutationResult> => {
        const result = await mutateInTransaction(actor, command, {
          contentId,
          expectedUpdatedAt,
          ...(desired ? { desired } : {}),
        }, transaction, dependencies);
        callbackCompleted = true;
        return result;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error: unknown) {
      if (error instanceof HospitalContentAuditFailure) throw new InfrastructureError("Hospital Content could not be saved");
      if (isRetryableTransactionFailure(error)) {
        if (attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) throw new ConflictError("Hospital Content changed during the operation");
        await retryDelay(attempt, dependencies);
        continue;
      }
      if (callbackCompleted) return { outcome: "UNCONFIRMED" };
      if (error instanceof ConflictError || error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof ValidationError || error instanceof InfrastructureError) throw error;
      throw new InfrastructureError("Hospital Content could not be saved");
    }
  }
  throw new ConflictError("Hospital Content changed during the operation");
}

export async function editHospitalContentDraft(actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalContentServiceDependencies = {}): Promise<HospitalContentMutationResult> {
  return mutateHospitalContent(actor, "EDIT", input, dependencies);
}

export async function publishHospitalContent(actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalContentServiceDependencies = {}): Promise<HospitalContentMutationResult> {
  return mutateHospitalContent(actor, "PUBLISH", input, dependencies);
}

export async function withdrawHospitalContent(actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalContentServiceDependencies = {}): Promise<HospitalContentMutationResult> {
  return mutateHospitalContent(actor, "WITHDRAW", input, dependencies);
}

export async function archiveHospitalContent(actor: ActorContext | null | undefined, input: unknown, dependencies: HospitalContentServiceDependencies = {}): Promise<HospitalContentMutationResult> {
  return mutateHospitalContent(actor, "ARCHIVE", input, dependencies);
}

export const hospitalContentServiceInternals = {
  MAX_TRANSACTION_ATTEMPTS,
  RETRY_DELAYS_MS,
  detailSelect,
  listItemSelect,
  getActiveOwnerHospitalWhere,
  toDetailProjection,
  toListItem,
  getPostgresSqlState,
  isRetryableTransactionFailure,
  lockAndRevalidateAuthority,
  validateStoredContentForPublish,
  expectedVersionMatches,
};
