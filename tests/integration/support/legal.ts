import { LegalDocumentStatus, type LegalDocumentKind, type PrismaClient } from "@prisma/client";

/** The seeded placeholder label (migration 20261204100000); tests never remove these rows. */
export const SEEDED_LEGAL_VERSION_LABEL = "placeholder-1";

async function currentVersionId(prisma: PrismaClient, kind: LegalDocumentKind): Promise<string> {
  const version = await prisma.legalDocumentVersion.findFirst({
    where: { kind, status: LegalDocumentStatus.PUBLISHED },
    orderBy: { publishedAt: "desc" },
    select: { id: true },
  });
  if (!version) throw new Error(`No published ${kind} version`);
  return version.id;
}

/** The current Terms + Privacy pair, as an account-creation screen would submit it. */
export async function currentLegalAcceptance(
  prisma: PrismaClient,
): Promise<{ termsVersionId: string; privacyVersionId: string }> {
  return {
    termsVersionId: await currentVersionId(prisma, "TERMS"),
    privacyVersionId: await currentVersionId(prisma, "PRIVACY_POLICY"),
  };
}

/** The legal fields every account-creation input carries (the transport sets `channel`). */
export async function accountCreationLegalFields(
  prisma: PrismaClient,
): Promise<{ acceptLegal: { termsVersionId: string; privacyVersionId: string }; channel: "WEB" }> {
  return { acceptLegal: await currentLegalAcceptance(prisma), channel: "WEB" };
}

export async function currentConsentVersionId(
  prisma: PrismaClient,
  kind: "HEALTH_DATA_DISCLOSURE_CONSENT" | "MARKETING_CONSENT",
): Promise<string> {
  return currentVersionId(prisma, kind);
}

/** Publishes a newer version of `kind` (as the ADMIN publish would), making earlier versions stale. */
export async function publishNewerLegalVersion(
  prisma: PrismaClient,
  kind: LegalDocumentKind,
  versionLabel: string,
): Promise<string> {
  const latest = await prisma.legalDocumentVersion.findFirst({
    where: { kind, status: LegalDocumentStatus.PUBLISHED },
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  });
  const publishedAt = new Date(Math.max(Date.now(), (latest?.publishedAt?.getTime() ?? 0) + 1));
  const created = await prisma.legalDocumentVersion.create({
    data: { kind, versionLabel, title: `ฉบับทดสอบ ${versionLabel}`, body: "ข้อความทดสอบ", status: LegalDocumentStatus.PUBLISHED, publishedAt },
    select: { id: true },
  });
  return created.id;
}

/**
 * Removes acceptance/consent evidence and every non-seed version. These tables are append-only / immutable outside
 * the disposable demo/test reset, so the reset switch is set for this transaction only.
 */
export async function clearLegalRecords(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    prisma.consentEvent.deleteMany(),
    prisma.legalAcceptance.deleteMany(),
    prisma.legalDocumentVersion.deleteMany({ where: { versionLabel: { not: SEEDED_LEGAL_VERSION_LABEL } } }),
  ]);
}
