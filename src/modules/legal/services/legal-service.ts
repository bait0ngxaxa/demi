import "server-only";

import {
  ConsentDecision,
  LegalAcceptanceSource,
  LegalDocumentStatus,
  Prisma,
  Role,
  UserStatus,
  type LegalChannel,
  type LegalDocumentKind,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assertPlatformAdminInDatabase } from "@/modules/hospital-governance/services/hospital-governance-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { CONSENT_DOCUMENT_KINDS, LEGAL_DOCUMENT_KINDS, type ConsentDocumentKind } from "../domain/legal-documents";
import {
  acceptCurrentLegalTermsSchema,
  legalDraftCreateSchema,
  legalDraftUpdateSchema,
  legalVersionLocatorSchema,
  legalVersionPublishSchema,
  recordConsentDecisionSchema,
  userLegalHistoryLookupSchema,
} from "../schemas/legal-schemas";
import {
  LEGAL_CONSENT_GIVEN_ACTION,
  LEGAL_CONSENT_WITHDRAWN_ACTION,
  LEGAL_TERMS_ACCEPTED_ACTION,
} from "./account-creation-legal-service";
import {
  assertCurrentTermsPair,
  findCurrentLegalVersions,
  LegalVersionConflictError,
  legalVersionSummarySelect,
  toLegalVersionSummary,
  type CurrentLegalVersions,
  type LegalVersionSummary,
} from "./legal-version-reader";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

export const LEGAL_VERSION_PUBLISHED_ACTION = "legal.version_published";
export const LEGAL_DRAFT_CREATED_ACTION = "legal.draft_created";
export const LEGAL_DRAFT_UPDATED_ACTION = "legal.draft_updated";
export const LEGAL_USER_HISTORY_READ_ACTION = "legal.user_history_read";
export const LEGAL_CONSENT_HISTORY_LIMIT = 50;

export type LegalServiceDependencies = { database?: PrismaClient };

export type LegalDocumentView = LegalVersionSummary & { body: string };

export type LegalAcceptanceRecord = {
  id: string;
  terms: LegalVersionSummary;
  privacy: LegalVersionSummary;
  acceptedAt: Date;
  channel: LegalChannel | null;
  source: LegalAcceptanceSource;
};

export type ConsentEventRecord = {
  id: string;
  kind: ConsentDocumentKind;
  decision: ConsentDecision;
  decidedAt: Date;
  channel: LegalChannel;
  version: LegalVersionSummary;
};

export type ConsentStatus = {
  kind: ConsentDocumentKind;
  current: LegalVersionSummary | null;
  state: "GIVEN" | "WITHDRAWN" | "NONE";
  latest: ConsentEventRecord | null;
  /** LG-D7: the consent stays given on the version it was given for; a newer published version is only flagged. */
  newVersionAvailable: boolean;
  history: ConsentEventRecord[];
};

export type MyLegalStatus = {
  current: CurrentLegalVersions;
  acceptance: LegalAcceptanceRecord | null;
  /** LG-D7: a newer TERMS or PRIVACY_POLICY version awaits acceptance; never blocks use. */
  needsAcceptance: boolean;
  /** LG-D6: the consents are offered only to a User holding a PATIENT role. */
  consentsOffered: boolean;
  consents: ConsentStatus[];
};

export type AdminLegalVersion = {
  id: string;
  kind: LegalDocumentKind;
  versionLabel: string;
  title: string;
  body: string;
  isPlaceholder: boolean;
  status: LegalDocumentStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isCurrent: boolean;
};

export type UserLegalHistory = {
  userId: string;
  displayName: string;
  acceptances: LegalAcceptanceRecord[];
  consentEvents: ConsentEventRecord[];
};

function databaseFor(dependencies: LegalServiceDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function requireActor(actor: ActorContext | null | undefined): ActorContext {
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

function rethrowSafe(error: unknown, fallback: string): never {
  if (error instanceof ConflictError || error instanceof ValidationError || error instanceof ForbiddenError ||
    error instanceof NotFoundError || error instanceof UnauthenticatedError || error instanceof InfrastructureError) {
    throw error;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictError("Legal record conflicts with existing data");
  }
  throw toInfrastructureError("legal.legal-service", error, fallback);
}

const acceptanceSelect = {
  id: true,
  acceptedAt: true,
  channel: true,
  source: true,
  termsVersion: { select: legalVersionSummarySelect },
  privacyVersion: { select: legalVersionSummarySelect },
} as const satisfies Prisma.LegalAcceptanceSelect;

const consentEventSelect = {
  id: true,
  kind: true,
  decision: true,
  decidedAt: true,
  channel: true,
  documentVersion: { select: legalVersionSummarySelect },
} as const satisfies Prisma.ConsentEventSelect;

function toAcceptanceRecord(row: Prisma.LegalAcceptanceGetPayload<{ select: typeof acceptanceSelect }>): LegalAcceptanceRecord {
  return {
    id: row.id,
    acceptedAt: row.acceptedAt,
    channel: row.channel,
    source: row.source,
    terms: toLegalVersionSummary(row.termsVersion),
    privacy: toLegalVersionSummary(row.privacyVersion),
  };
}

function toConsentEventRecord(row: Prisma.ConsentEventGetPayload<{ select: typeof consentEventSelect }>): ConsentEventRecord {
  const kind = CONSENT_DOCUMENT_KINDS.find((candidate) => candidate === row.kind);
  if (!kind) throw new InfrastructureError("Consent event kind is invalid");
  return {
    id: row.id,
    kind,
    decision: row.decision,
    decidedAt: row.decidedAt,
    channel: row.channel,
    version: toLegalVersionSummary(row.documentVersion),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------------------------------------------

export async function getCurrentLegalVersions(dependencies: LegalServiceDependencies = {}): Promise<CurrentLegalVersions> {
  try {
    return await findCurrentLegalVersions(databaseFor(dependencies));
  } catch (error: unknown) {
    rethrowSafe(error, "Legal documents could not be loaded");
  }
}

/** The current published version of every kind with its text; a kind without a published version is null. */
export async function getCurrentLegalDocuments(
  dependencies: LegalServiceDependencies = {},
): Promise<Readonly<Record<LegalDocumentKind, LegalDocumentView | null>>> {
  try {
    const database = databaseFor(dependencies);
    const current = await findCurrentLegalVersions(database);
    const ids = LEGAL_DOCUMENT_KINDS.flatMap((kind) => current[kind]?.id ?? []);
    const bodies = await database.legalDocumentVersion.findMany({ where: { id: { in: ids } }, select: { id: true, body: true } });
    const bodyById = new Map(bodies.map(({ id, body }) => [id, body]));
    const entries = LEGAL_DOCUMENT_KINDS.map((kind) => {
      const summary = current[kind];
      const body = summary ? bodyById.get(summary.id) : undefined;
      return [kind, summary && body !== undefined ? { ...summary, body } : null] as const;
    });
    return Object.fromEntries(entries) as Record<LegalDocumentKind, LegalDocumentView | null>;
  } catch (error: unknown) {
    rethrowSafe(error, "Legal documents could not be loaded");
  }
}

/** One PUBLISHED version by kind and label (public history); drafts are never served here. */
export async function getLegalDocumentVersion(
  input: unknown,
  dependencies: LegalServiceDependencies = {},
): Promise<LegalDocumentView & { isCurrent: boolean }> {
  const parsed = legalVersionLocatorSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  try {
    const database = databaseFor(dependencies);
    const row = await database.legalDocumentVersion.findFirst({
      where: { kind: parsed.data.kind, versionLabel: parsed.data.versionLabel, status: LegalDocumentStatus.PUBLISHED },
      select: { ...legalVersionSummarySelect, body: true },
    });
    if (!row) throw new NotFoundError();
    const current = await findCurrentLegalVersions(database);
    return { ...toLegalVersionSummary(row), body: row.body, isCurrent: current[row.kind]?.id === row.id };
  } catch (error: unknown) {
    rethrowSafe(error, "Legal document could not be loaded");
  }
}

/** Every published version of a kind, newest first (public history list). */
export async function listPublishedLegalVersions(
  kind: LegalDocumentKind,
  dependencies: LegalServiceDependencies = {},
): Promise<LegalVersionSummary[]> {
  try {
    const rows = await databaseFor(dependencies).legalDocumentVersion.findMany({
      where: { kind, status: LegalDocumentStatus.PUBLISHED },
      orderBy: { publishedAt: "desc" },
      select: legalVersionSummarySelect,
    });
    return rows.map(toLegalVersionSummary);
  } catch (error: unknown) {
    rethrowSafe(error, "Legal document history could not be loaded");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Signed-in User
// ---------------------------------------------------------------------------------------------------------------

async function hasPatientRole(database: Prisma.TransactionClient | PrismaClient, userId: string): Promise<boolean> {
  const user = await database.user.findFirst({
    where: { id: userId, status: UserStatus.ACTIVE, roles: { some: { role: Role.PATIENT } } },
    select: { id: true },
  });
  return user !== null;
}

export async function getMyLegalStatus(
  actorInput: ActorContext | null | undefined,
  dependencies: LegalServiceDependencies = {},
): Promise<MyLegalStatus> {
  const actor = requireActor(actorInput);
  try {
    const database = databaseFor(dependencies);
    const [current, acceptance, consentsOffered, events] = await Promise.all([
      findCurrentLegalVersions(database),
      database.legalAcceptance.findFirst({
        where: { userId: actor.userId },
        orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
        select: acceptanceSelect,
      }),
      hasPatientRole(database, actor.userId),
      database.consentEvent.findMany({
        where: { userId: actor.userId },
        orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
        take: LEGAL_CONSENT_HISTORY_LIMIT * CONSENT_DOCUMENT_KINDS.length,
        select: consentEventSelect,
      }),
    ]);
    const terms = current.TERMS;
    const privacy = current.PRIVACY_POLICY;
    const acceptedCurrentPair = terms && privacy
      ? await database.legalAcceptance.findUnique({
          where: { userId_termsVersionId_privacyVersionId: { userId: actor.userId, termsVersionId: terms.id, privacyVersionId: privacy.id } },
          select: acceptanceSelect,
        })
      : null;
    const records = events.map(toConsentEventRecord);
    const consents = CONSENT_DOCUMENT_KINDS.map((kind): ConsentStatus => {
      const history = records.filter((event) => event.kind === kind).slice(0, LEGAL_CONSENT_HISTORY_LIMIT);
      const latest = history[0] ?? null;
      const kindCurrent = current[kind];
      return {
        kind,
        current: kindCurrent,
        state: latest ? latest.decision : "NONE",
        latest,
        newVersionAvailable: latest?.decision === ConsentDecision.GIVEN && kindCurrent !== null && latest.version.id !== kindCurrent.id,
        history,
      };
    });
    return {
      current,
      acceptance: acceptedCurrentPair ? toAcceptanceRecord(acceptedCurrentPair) : acceptance ? toAcceptanceRecord(acceptance) : null,
      needsAcceptance: Boolean(terms && privacy) && !acceptedCurrentPair,
      consentsOffered,
      consents,
    };
  } catch (error: unknown) {
    rethrowSafe(error, "Legal status could not be loaded");
  }
}

/** Shell banner check (LG-D7): cheap, and a failure never blocks the shell. */
export async function needsLegalReacceptance(
  actorInput: ActorContext | null | undefined,
  dependencies: LegalServiceDependencies = {},
): Promise<boolean> {
  const actor = requireActor(actorInput);
  try {
    const database = databaseFor(dependencies);
    const current = await findCurrentLegalVersions(database);
    if (!current.TERMS || !current.PRIVACY_POLICY) return false;
    const accepted = await database.legalAcceptance.findUnique({
      where: { userId_termsVersionId_privacyVersionId: { userId: actor.userId, termsVersionId: current.TERMS.id, privacyVersionId: current.PRIVACY_POLICY.id } },
      select: { id: true },
    });
    return accepted === null;
  } catch (error: unknown) {
    rethrowSafe(error, "Legal status could not be loaded");
  }
}

/** Settings "ยอมรับเวอร์ชันใหม่": the pair must be the current one; the same pair again is a no-op. */
export async function acceptCurrentLegalTerms(
  actorInput: ActorContext | null | undefined,
  input: unknown,
  dependencies: LegalServiceDependencies = {},
): Promise<{ acceptanceId: string; alreadyAccepted: boolean }> {
  const actor = requireActor(actorInput);
  const parsed = acceptCurrentLegalTermsSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Legal acceptance data is invalid");
  try {
    return await runSerializableTransaction(databaseFor(dependencies), async (transaction) => {
      const user = await transaction.user.findFirst({ where: { id: actor.userId, status: UserStatus.ACTIVE }, select: { id: true } });
      if (!user) throw new ForbiddenError();
      const existing = await transaction.legalAcceptance.findUnique({
        where: { userId_termsVersionId_privacyVersionId: { userId: actor.userId, termsVersionId: parsed.data.termsVersionId, privacyVersionId: parsed.data.privacyVersionId } },
        select: { id: true },
      });
      if (existing) return { acceptanceId: existing.id, alreadyAccepted: true };
      const { terms, privacy } = assertCurrentTermsPair(await findCurrentLegalVersions(transaction), parsed.data);
      const created = await transaction.legalAcceptance.create({
        data: {
          userId: actor.userId,
          termsVersionId: terms.id,
          privacyVersionId: privacy.id,
          source: LegalAcceptanceSource.SETTINGS,
          channel: parsed.data.channel,
        },
        select: { id: true },
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: LEGAL_TERMS_ACCEPTED_ACTION,
        resourceType: "User",
        resourceId: actor.userId,
        metadata: {
          source: LegalAcceptanceSource.SETTINGS,
          channel: parsed.data.channel,
          termsVersionId: terms.id,
          termsVersionLabel: terms.versionLabel,
          privacyVersionId: privacy.id,
          privacyVersionLabel: privacy.versionLabel,
        },
      }, transaction);
      return { acceptanceId: created.id, alreadyAccepted: false };
    });
  } catch (error: unknown) {
    rethrowSafe(error, "Legal acceptance could not be recorded");
  }
}

/**
 * LG-D4/LG-D6: give or withdraw one consent. PATIENT only, current version only, idempotent by submission nonce;
 * a decision that changes nothing (giving the same version again, withdrawing what is not given) is a conflict.
 */
export async function recordConsentDecision(
  actorInput: ActorContext | null | undefined,
  input: unknown,
  dependencies: LegalServiceDependencies = {},
): Promise<{ eventId: string; decision: ConsentDecision; decidedAt: Date; replayed: boolean }> {
  const actor = requireActor(actorInput);
  const parsed = recordConsentDecisionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Consent decision data is invalid");
  const { kind, documentVersionId, decision, submissionNonce, channel } = parsed.data;
  try {
    return await runSerializableTransaction(databaseFor(dependencies), async (transaction) => {
      if (!await hasPatientRole(transaction, actor.userId)) throw new ForbiddenError();
      const replay = await transaction.consentEvent.findUnique({
        where: { submissionNonce },
        select: { id: true, userId: true, kind: true, decision: true, documentVersionId: true, decidedAt: true },
      });
      if (replay) {
        if (replay.userId !== actor.userId || replay.kind !== kind || replay.decision !== decision || replay.documentVersionId !== documentVersionId) {
          throw new ConflictError("Consent submission nonce was already used");
        }
        return { eventId: replay.id, decision: replay.decision, decidedAt: replay.decidedAt, replayed: true };
      }
      const current = (await findCurrentLegalVersions(transaction))[kind];
      if (!current || current.id !== documentVersionId) throw new LegalVersionConflictError();
      const latest = await transaction.consentEvent.findFirst({
        where: { userId: actor.userId, kind },
        orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
        select: { decision: true, documentVersionId: true },
      });
      const noOp = decision === ConsentDecision.GIVEN
        ? latest?.decision === ConsentDecision.GIVEN && latest.documentVersionId === documentVersionId
        : !latest || latest.decision === ConsentDecision.WITHDRAWN;
      if (noOp) throw new ConflictError("Consent decision does not change the current state");
      const created = await transaction.consentEvent.create({
        data: { userId: actor.userId, kind, documentVersionId, decision, channel, submissionNonce },
        select: { id: true, decision: true, decidedAt: true },
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: decision === ConsentDecision.GIVEN ? LEGAL_CONSENT_GIVEN_ACTION : LEGAL_CONSENT_WITHDRAWN_ACTION,
        resourceType: "User",
        resourceId: actor.userId,
        metadata: { kind, documentVersionId, versionLabel: current.versionLabel, source: LegalAcceptanceSource.SETTINGS, channel },
      }, transaction);
      return { eventId: created.id, decision: created.decision, decidedAt: created.decidedAt, replayed: false };
    });
  } catch (error: unknown) {
    rethrowSafe(error, "Consent decision could not be recorded");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Platform ADMIN (LG-D3)
// ---------------------------------------------------------------------------------------------------------------

async function assertAdmin(database: PrismaClient | Prisma.TransactionClient, actor: ActorContext): Promise<void> {
  if (!actor.roles.includes(Role.ADMIN)) throw new ForbiddenError();
  await assertPlatformAdminInDatabase(database, actor.userId);
}

const adminVersionSelect = {
  id: true,
  kind: true,
  versionLabel: true,
  title: true,
  body: true,
  isPlaceholder: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.LegalDocumentVersionSelect;

type AdminVersionRow = Prisma.LegalDocumentVersionGetPayload<{ select: typeof adminVersionSelect }>;

function toAdminVersion(row: AdminVersionRow, current: CurrentLegalVersions): AdminLegalVersion {
  return { ...row, isCurrent: current[row.kind]?.id === row.id };
}

export async function listLegalVersions(
  actorInput: ActorContext | null | undefined,
  dependencies: LegalServiceDependencies = {},
): Promise<AdminLegalVersion[]> {
  const actor = requireActor(actorInput);
  const database = databaseFor(dependencies);
  try {
    await assertAdmin(database, actor);
    const [rows, current] = await Promise.all([
      database.legalDocumentVersion.findMany({
        orderBy: [{ kind: "asc" }, { status: "asc" }, { publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
        select: adminVersionSelect,
      }),
      findCurrentLegalVersions(database),
    ]);
    return rows.map((row) => toAdminVersion(row, current));
  } catch (error: unknown) {
    rethrowSafe(error, "Legal versions could not be loaded");
  }
}

/** Draft preview for ADMIN; a published version is also readable here. */
export async function getLegalVersionForAdmin(
  actorInput: ActorContext | null | undefined,
  versionId: unknown,
  dependencies: LegalServiceDependencies = {},
): Promise<AdminLegalVersion> {
  const actor = requireActor(actorInput);
  if (typeof versionId !== "string" || !/^[0-9a-f-]{36}$/u.test(versionId)) throw new NotFoundError();
  const database = databaseFor(dependencies);
  try {
    await assertAdmin(database, actor);
    const [row, current] = await Promise.all([
      database.legalDocumentVersion.findUnique({ where: { id: versionId }, select: adminVersionSelect }),
      findCurrentLegalVersions(database),
    ]);
    if (!row) throw new NotFoundError();
    return toAdminVersion(row, current);
  } catch (error: unknown) {
    rethrowSafe(error, "Legal version could not be loaded");
  }
}

export async function createLegalDraft(
  actorInput: ActorContext | null | undefined,
  input: unknown,
  dependencies: LegalServiceDependencies = {},
): Promise<{ versionId: string }> {
  const actor = requireActor(actorInput);
  const parsed = legalDraftCreateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Legal draft data is invalid");
  try {
    return await runSerializableTransaction(databaseFor(dependencies), async (transaction) => {
      await assertAdmin(transaction, actor);
      const created = await transaction.legalDocumentVersion.create({
        data: { ...parsed.data, status: LegalDocumentStatus.DRAFT, isPlaceholder: false, createdByUserId: actor.userId },
        select: { id: true },
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: LEGAL_DRAFT_CREATED_ACTION,
        resourceType: "LegalDocumentVersion",
        resourceId: created.id,
        metadata: { kind: parsed.data.kind, versionLabel: parsed.data.versionLabel },
      }, transaction);
      return { versionId: created.id };
    }, 0);
  } catch (error: unknown) {
    rethrowSafe(error, "Legal draft could not be created");
  }
}

export async function updateLegalDraft(
  actorInput: ActorContext | null | undefined,
  input: unknown,
  dependencies: LegalServiceDependencies = {},
): Promise<{ versionId: string; updatedAt: Date }> {
  const actor = requireActor(actorInput);
  const parsed = legalDraftUpdateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Legal draft data is invalid");
  const { versionId, ...data } = parsed.data;
  try {
    return await runSerializableTransaction(databaseFor(dependencies), async (transaction) => {
      await assertAdmin(transaction, actor);
      const existing = await transaction.legalDocumentVersion.findUnique({ where: { id: versionId }, select: { kind: true, status: true } });
      if (!existing) throw new NotFoundError();
      if (existing.status !== LegalDocumentStatus.DRAFT) throw new ConflictError("A published legal version cannot be edited");
      const updated = await transaction.legalDocumentVersion.update({
        where: { id: versionId },
        data,
        select: { id: true, updatedAt: true },
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: LEGAL_DRAFT_UPDATED_ACTION,
        resourceType: "LegalDocumentVersion",
        resourceId: versionId,
        metadata: { kind: existing.kind, versionLabel: data.versionLabel },
      }, transaction);
      return { versionId: updated.id, updatedAt: updated.updatedAt };
    }, 0);
  } catch (error: unknown) {
    rethrowSafe(error, "Legal draft could not be updated");
  }
}

/** DRAFT → PUBLISHED (immutable from then on); it becomes the current version of its kind. */
export async function publishLegalVersion(
  actorInput: ActorContext | null | undefined,
  input: unknown,
  dependencies: LegalServiceDependencies = {},
): Promise<{ versionId: string; publishedAt: Date }> {
  const actor = requireActor(actorInput);
  const parsed = legalVersionPublishSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Legal publish data is invalid");
  try {
    return await runSerializableTransaction(databaseFor(dependencies), async (transaction) => {
      await assertAdmin(transaction, actor);
      const draft = await transaction.legalDocumentVersion.findUnique({
        where: { id: parsed.data.versionId },
        select: { id: true, kind: true, versionLabel: true, status: true, updatedAt: true },
      });
      if (!draft) throw new NotFoundError();
      if (draft.status !== LegalDocumentStatus.DRAFT) throw new ConflictError("Legal version is already published");
      if (draft.updatedAt.getTime() !== new Date(parsed.data.expectedUpdatedAt).getTime()) {
        throw new ConflictError("Legal draft changed after preview");
      }
      const latest = await transaction.legalDocumentVersion.findFirst({
        where: { kind: draft.kind, status: LegalDocumentStatus.PUBLISHED },
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true },
      });
      const now = new Date();
      // Keep "latest publishedAt = current" strict even if the clock lags the previous publication.
      const publishedAt = latest?.publishedAt && latest.publishedAt.getTime() >= now.getTime()
        ? new Date(latest.publishedAt.getTime() + 1)
        : now;
      const published = await transaction.legalDocumentVersion.updateMany({
        where: { id: draft.id, status: LegalDocumentStatus.DRAFT, updatedAt: draft.updatedAt },
        data: { status: LegalDocumentStatus.PUBLISHED, publishedAt, publishedByUserId: actor.userId },
      });
      if (published.count !== 1) throw new ConflictError("Legal draft changed during publication");
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: LEGAL_VERSION_PUBLISHED_ACTION,
        resourceType: "LegalDocumentVersion",
        resourceId: draft.id,
        metadata: { kind: draft.kind, versionLabel: draft.versionLabel },
      }, transaction);
      return { versionId: draft.id, publishedAt };
    });
  } catch (error: unknown) {
    rethrowSafe(error, "Legal version could not be published");
  }
}

/** DPO request support: one User's acceptance and consent history by exact Thai National ID; every read is audited. */
export async function getUserLegalHistory(
  actorInput: ActorContext | null | undefined,
  input: unknown,
  dependencies: LegalServiceDependencies = {},
): Promise<UserLegalHistory | null> {
  const actor = requireActor(actorInput);
  const parsed = userLegalHistoryLookupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("National ID is invalid");
  const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: parsed.data.nationalId });
  try {
    return await runSerializableTransaction(databaseFor(dependencies), async (transaction) => {
      await assertAdmin(transaction, actor);
      const person = await transaction.person.findUnique({
        where: { identityKeyHash },
        select: { givenName: true, familyName: true, user: { select: { id: true } } },
      });
      const userId = person?.user?.id ?? null;
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: LEGAL_USER_HISTORY_READ_ACTION,
        resourceType: "User",
        ...(userId ? { resourceId: userId } : {}),
        metadata: { found: userId !== null },
      }, transaction);
      if (!person || !userId) return null;
      const acceptances = await transaction.legalAcceptance.findMany({
        where: { userId }, orderBy: [{ acceptedAt: "desc" }, { id: "desc" }], select: acceptanceSelect,
      });
      const consentEvents = await transaction.consentEvent.findMany({
        where: { userId }, orderBy: [{ decidedAt: "desc" }, { id: "desc" }], select: consentEventSelect,
      });
      return {
        userId,
        displayName: `${person.givenName} ${person.familyName}`.trim(),
        acceptances: acceptances.map(toAcceptanceRecord),
        consentEvents: consentEvents.map(toConsentEventRecord),
      };
    });
  } catch (error: unknown) {
    rethrowSafe(error, "Legal history could not be loaded");
  }
}
