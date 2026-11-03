import "server-only";

import { CONSENT_DOCUMENT_KINDS } from "../domain/legal-documents";
import type { AccountCreationLegalView, LegalVersionView } from "../domain/legal-views";
import { getCurrentLegalVersions } from "../services/legal-service";
import type { LegalVersionSummary } from "../services/legal-version-reader";

export function toLegalVersionView(version: LegalVersionSummary): LegalVersionView {
  return { ...version, publishedAt: version.publishedAt.toISOString() };
}

/**
 * Current versions for an account-creation screen. Null when TERMS or PRIVACY_POLICY has no published version: the
 * screen then cannot record an acceptance and fails closed.
 */
export async function getAccountCreationLegalView(
  options: { includeConsents: boolean },
): Promise<AccountCreationLegalView | null> {
  const current = await getCurrentLegalVersions();
  if (!current.TERMS || !current.PRIVACY_POLICY) return null;
  const consents = options.includeConsents
    ? CONSENT_DOCUMENT_KINDS.flatMap((kind) => {
        const version = current[kind];
        return version ? [{ ...toLegalVersionView(version), kind }] : [];
      })
    : [];
  return { terms: toLegalVersionView(current.TERMS), privacy: toLegalVersionView(current.PRIVACY_POLICY), consents };
}
