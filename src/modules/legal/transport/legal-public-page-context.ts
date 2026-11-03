import "server-only";

import { notFound } from "next/navigation";

import { ApplicationError } from "@/shared/errors/application-error";

import { legalDocumentKindFromSlug } from "../domain/legal-documents";
import type { LegalVersionView } from "../domain/legal-views";
import { getCurrentLegalDocuments, getLegalDocumentVersion, listPublishedLegalVersions } from "../services/legal-service";
import { toLegalVersionView } from "./legal-page-context";

export type PublicLegalDocumentContext = {
  document: LegalVersionView & { body: string };
  isCurrent: boolean;
  history: LegalVersionView[];
};

/** `/legal/[kind]` (current) and `/legal/[kind]/[versionLabel]` (one published version); drafts are never served. */
export async function getPublicLegalDocumentContext(slug: string, versionLabel?: string): Promise<PublicLegalDocumentContext> {
  const kind = legalDocumentKindFromSlug(slug);
  if (!kind) notFound();
  try {
    const history = (await listPublishedLegalVersions(kind)).map(toLegalVersionView);
    if (versionLabel === undefined) {
      const current = (await getCurrentLegalDocuments())[kind];
      if (!current) notFound();
      return { document: { ...toLegalVersionView(current), body: current.body }, isCurrent: true, history };
    }
    const version = await getLegalDocumentVersion({ kind, versionLabel: decodeURIComponent(versionLabel) });
    return { document: { ...toLegalVersionView(version), body: version.body }, isCurrent: version.isCurrent, history };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && (error.code === "NOT_FOUND" || error.code === "VALIDATION")) notFound();
    throw error;
  }
}
