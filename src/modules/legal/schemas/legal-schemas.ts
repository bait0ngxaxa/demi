import { z } from "zod";

import { thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";

import { CONSENT_DECISIONS, CONSENT_DOCUMENT_KINDS, LEGAL_CHANNELS, LEGAL_DOCUMENT_KINDS } from "../domain/legal-documents";

export const LEGAL_DOCUMENT_TITLE_MAX = 200;
export const LEGAL_DOCUMENT_BODY_MAX = 100_000;

export const legalDocumentKindSchema = z.enum(LEGAL_DOCUMENT_KINDS);
export const consentDocumentKindSchema = z.enum(CONSENT_DOCUMENT_KINDS);
export const legalChannelSchema = z.enum(LEGAL_CHANNELS);
export const consentDecisionSchema = z.enum(CONSENT_DECISIONS);

/** URL-safe, so a version is addressable at `/legal/[kind]/[versionLabel]`. */
export const legalVersionLabelSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/u);

/** The Terms + Privacy pair the person saw and accepted in one required checkbox (LG-D4). */
export const legalAcceptanceInputSchema = z.object({
  termsVersionId: z.uuid(),
  privacyVersionId: z.uuid(),
}).strict();

/** Optional consents chosen on a PATIENT account-creation screen; an unchecked consent is simply absent. */
export const accountCreationConsentsSchema = z.array(z.object({
  kind: consentDocumentKindSchema,
  documentVersionId: z.uuid(),
}).strict()).max(CONSENT_DOCUMENT_KINDS.length).refine(
  (consents) => new Set(consents.map(({ kind }) => kind)).size === consents.length,
);

export const acceptCurrentLegalTermsSchema = legalAcceptanceInputSchema.extend({
  channel: legalChannelSchema,
}).strict();

export const recordConsentDecisionSchema = z.object({
  kind: consentDocumentKindSchema,
  documentVersionId: z.uuid(),
  decision: consentDecisionSchema,
  submissionNonce: z.uuid(),
  channel: legalChannelSchema,
}).strict();

export const legalDraftCreateSchema = z.object({
  kind: legalDocumentKindSchema,
  versionLabel: legalVersionLabelSchema,
  title: z.string().trim().min(1).max(LEGAL_DOCUMENT_TITLE_MAX),
  body: z.string().trim().min(1).max(LEGAL_DOCUMENT_BODY_MAX),
}).strict();

export const legalDraftUpdateSchema = z.object({
  versionId: z.uuid(),
  versionLabel: legalVersionLabelSchema,
  title: z.string().trim().min(1).max(LEGAL_DOCUMENT_TITLE_MAX),
  body: z.string().trim().min(1).max(LEGAL_DOCUMENT_BODY_MAX),
}).strict();

export const legalVersionPublishSchema = z.object({
  versionId: z.uuid(),
  /** The admin confirms the exact text they previewed; a later edit makes the confirmation stale. */
  expectedUpdatedAt: z.iso.datetime(),
}).strict();

export const legalVersionLocatorSchema = z.object({
  kind: legalDocumentKindSchema,
  versionLabel: legalVersionLabelSchema,
}).strict();

export const userLegalHistoryLookupSchema = z.object({
  nationalId: thaiNationalIdSchema,
}).strict();

export type LegalAcceptanceInput = z.infer<typeof legalAcceptanceInputSchema>;
export type AccountCreationConsentsInput = z.infer<typeof accountCreationConsentsSchema>;
export type AcceptCurrentLegalTermsInput = z.infer<typeof acceptCurrentLegalTermsSchema>;
export type RecordConsentDecisionInput = z.infer<typeof recordConsentDecisionSchema>;
