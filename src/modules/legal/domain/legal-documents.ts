import type { ConsentDecision, LegalAcceptanceSource, LegalChannel, LegalDocumentKind } from "@prisma/client";

/** ADR-0028 LG-D2: the four agency-owned documents, in display order. */
export const LEGAL_DOCUMENT_KINDS = [
  "TERMS",
  "PRIVACY_POLICY",
  "HEALTH_DATA_DISCLOSURE_CONSENT",
  "MARKETING_CONSENT",
] as const satisfies readonly LegalDocumentKind[];

/** LG-D4: the two optional, separate, withdrawable PDPA consents (ม.19; health data ม.26). */
export const CONSENT_DOCUMENT_KINDS = [
  "HEALTH_DATA_DISCLOSURE_CONSENT",
  "MARKETING_CONSENT",
] as const satisfies readonly LegalDocumentKind[];

export type ConsentDocumentKind = (typeof CONSENT_DOCUMENT_KINDS)[number];

export const LEGAL_CHANNELS = ["WEB", "LIFF"] as const satisfies readonly LegalChannel[];
export const CONSENT_DECISIONS = ["GIVEN", "WITHDRAWN"] as const satisfies readonly ConsentDecision[];

/** Account-creation sources; SETTINGS is the only post-creation source. */
export type AccountCreationLegalSource = Exclude<LegalAcceptanceSource, "SETTINGS">;

export const LEGAL_DOCUMENT_TITLES: Readonly<Record<LegalDocumentKind, string>> = {
  TERMS: "ข้อกำหนดและเงื่อนไขการใช้บริการ",
  PRIVACY_POLICY: "นโยบายการคุ้มครองข้อมูลส่วนบุคคล",
  HEALTH_DATA_DISCLOSURE_CONSENT: "หนังสือแสดงความยินยอมให้เปิดเผยข้อมูลสุขภาพส่วนบุคคล",
  MARKETING_CONSENT: "หนังสือตกลงยินยอมในการเปิดเผยข้อมูลเพื่อวัตถุประสงค์ทางการตลาด",
};

/** Short summaries next to the optional consent toggles (LG-2). */
export const CONSENT_SUMMARIES: Readonly<Record<ConsentDocumentKind, string>> = {
  HEALTH_DATA_DISCLOSURE_CONSENT: "ยินยอมให้เปิดเผยข้อมูลสุขภาพส่วนบุคคลตามหนังสือแสดงความยินยอม ไม่บังคับ และถอนได้ทุกเมื่อในการตั้งค่า",
  MARKETING_CONSENT: "ยินยอมให้เปิดเผยข้อมูลเพื่อวัตถุประสงค์ทางการตลาด ไม่บังคับ และถอนได้ทุกเมื่อในการตั้งค่า",
};

/** Public URL segment of each kind: `/legal/[kind]/[versionLabel]`. */
export const LEGAL_DOCUMENT_SLUGS: Readonly<Record<LegalDocumentKind, string>> = {
  TERMS: "terms",
  PRIVACY_POLICY: "privacy",
  HEALTH_DATA_DISCLOSURE_CONSENT: "health-data-consent",
  MARKETING_CONSENT: "marketing-consent",
};

export const LEGAL_TERMS_ACCEPTANCE_LABEL =
  "ข้าพเจ้ายอมรับข้อกำหนดและเงื่อนไขการใช้บริการ และรับทราบนโยบายการคุ้มครองข้อมูลส่วนบุคคล";

export const LEGAL_VERSION_CHANGED_MESSAGE =
  "มีเวอร์ชันใหม่ของข้อกำหนดหรือนโยบาย กรุณาอ่านและยอมรับอีกครั้ง";

export const LEGAL_ACCEPTANCE_REQUIRED_MESSAGE =
  "กรุณายอมรับข้อกำหนดและเงื่อนไขการใช้บริการ และรับทราบนโยบายการคุ้มครองข้อมูลส่วนบุคคล";

export function legalDocumentKindFromSlug(slug: string): LegalDocumentKind | null {
  const match = LEGAL_DOCUMENT_KINDS.find((kind) => LEGAL_DOCUMENT_SLUGS[kind] === slug);
  return match ?? null;
}

/** `/legal/terms`, `/legal/privacy`, … show the current version; a label addresses one published version. */
export function legalDocumentHref(kind: LegalDocumentKind, versionLabel?: string): string {
  const base = `/legal/${LEGAL_DOCUMENT_SLUGS[kind]}`;
  return versionLabel ? `${base}/${encodeURIComponent(versionLabel)}` : base;
}

export function isConsentDocumentKind(kind: LegalDocumentKind): kind is ConsentDocumentKind {
  return (CONSENT_DOCUMENT_KINDS as readonly LegalDocumentKind[]).includes(kind);
}

/**
 * The request channel of a legal decision. Informational only (no business authority): the LINE in-app browser,
 * which hosts LIFF, identifies itself with a "Line/<version>" User-Agent token.
 */
export function legalChannelFromUserAgent(userAgent: string | null | undefined): LegalChannel {
  return userAgent && /\bLine\/\d/u.test(userAgent) ? "LIFF" : "WEB";
}
