import "server-only";

import { LegalDocumentStatus, type LegalDocumentKind, type Prisma, type PrismaClient } from "@prisma/client";

import { ConflictError, ValidationError } from "@/shared/errors/application-error";

import { LEGAL_DOCUMENT_KINDS } from "../domain/legal-documents";

export type LegalReadDatabase = Pick<PrismaClient, "legalDocumentVersion"> | Prisma.TransactionClient;

export type LegalVersionSummary = {
  id: string;
  kind: LegalDocumentKind;
  versionLabel: string;
  title: string;
  isPlaceholder: boolean;
  publishedAt: Date;
};

export type CurrentLegalVersions = Readonly<Record<LegalDocumentKind, LegalVersionSummary | null>>;

/** Thrown when the submitted Terms/Privacy/consent version is no longer the current one ("มีเวอร์ชันใหม่"). */
export class LegalVersionConflictError extends ConflictError {
  constructor() {
    super("A newer legal document version was published");
    this.name = "LegalVersionConflictError";
  }
}

/** Thrown when an account-creation step arrives without the required Terms + Privacy acceptance. */
export class LegalAcceptanceRequiredError extends ValidationError {
  constructor() {
    super("Legal acceptance is required");
    this.name = "LegalAcceptanceRequiredError";
  }
}

export const legalVersionSummarySelect = {
  id: true,
  kind: true,
  versionLabel: true,
  title: true,
  isPlaceholder: true,
  publishedAt: true,
} as const satisfies Prisma.LegalDocumentVersionSelect;

type SelectedSummary = Prisma.LegalDocumentVersionGetPayload<{ select: typeof legalVersionSummarySelect }>;

export function toLegalVersionSummary(row: SelectedSummary): LegalVersionSummary {
  if (!row.publishedAt) throw new ConflictError("Legal document version is not published");
  return { ...row, publishedAt: row.publishedAt };
}

/** The current version of each kind = its PUBLISHED row with the latest publishedAt (ADR-0028). */
export async function findCurrentLegalVersions(database: LegalReadDatabase): Promise<CurrentLegalVersions> {
  const rows = await database.legalDocumentVersion.findMany({
    where: { status: LegalDocumentStatus.PUBLISHED },
    orderBy: [{ kind: "asc" }, { publishedAt: "desc" }],
    distinct: ["kind"],
    select: legalVersionSummarySelect,
  });
  const byKind = new Map(rows.map((row) => [row.kind, toLegalVersionSummary(row)]));
  return Object.fromEntries(LEGAL_DOCUMENT_KINDS.map((kind) => [kind, byKind.get(kind) ?? null])) as Record<
    LegalDocumentKind,
    LegalVersionSummary | null
  >;
}

/** Fails closed when either document has no published version or the pair is not the current one. */
export function assertCurrentTermsPair(
  current: CurrentLegalVersions,
  input: { termsVersionId: string; privacyVersionId: string },
): { terms: LegalVersionSummary; privacy: LegalVersionSummary } {
  const terms = current.TERMS;
  const privacy = current.PRIVACY_POLICY;
  if (!terms || !privacy || terms.id !== input.termsVersionId || privacy.id !== input.privacyVersionId) {
    throw new LegalVersionConflictError();
  }
  return { terms, privacy };
}
