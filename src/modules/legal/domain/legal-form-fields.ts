import type { ConsentDocumentKind } from "./legal-documents";

/** Form field names shared by every account-creation screen and its server action. */
export const LEGAL_FORM_FIELDS = {
  accept: "acceptLegal",
  termsVersionId: "legalTermsVersionId",
  privacyVersionId: "legalPrivacyVersionId",
} as const;

export function legalConsentFieldName(kind: ConsentDocumentKind): string {
  return `consent.${kind}`;
}
