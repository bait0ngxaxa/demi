import { vi } from "vitest";

export const TERMS_VERSION_ID = "a0000000-0000-4000-8000-000000000001";
export const PRIVACY_VERSION_ID = "a0000000-0000-4000-8000-000000000002";
export const HEALTH_CONSENT_VERSION_ID = "a0000000-0000-4000-8000-000000000003";
export const MARKETING_CONSENT_VERSION_ID = "a0000000-0000-4000-8000-000000000004";

export const legalAcceptanceFixture = {
  termsVersionId: TERMS_VERSION_ID,
  privacyVersionId: PRIVACY_VERSION_ID,
} as const;

const publishedAt = new Date("2026-11-03T00:00:00.000Z");

/** Rows as `findCurrentLegalVersions` reads them (one current PUBLISHED version per kind). */
export const currentLegalVersionRows = [
  { id: TERMS_VERSION_ID, kind: "TERMS", versionLabel: "placeholder-1", title: "ข้อกำหนดและเงื่อนไขการใช้บริการ", isPlaceholder: true, publishedAt },
  { id: PRIVACY_VERSION_ID, kind: "PRIVACY_POLICY", versionLabel: "placeholder-1", title: "นโยบายการคุ้มครองข้อมูลส่วนบุคคล", isPlaceholder: true, publishedAt },
  { id: HEALTH_CONSENT_VERSION_ID, kind: "HEALTH_DATA_DISCLOSURE_CONSENT", versionLabel: "placeholder-1", title: "หนังสือแสดงความยินยอมให้เปิดเผยข้อมูลสุขภาพส่วนบุคคล", isPlaceholder: true, publishedAt },
  { id: MARKETING_CONSENT_VERSION_ID, kind: "MARKETING_CONSENT", versionLabel: "placeholder-1", title: "หนังสือตกลงยินยอมในการเปิดเผยข้อมูลเพื่อวัตถุประสงค์ทางการตลาด", isPlaceholder: true, publishedAt },
];

/** Mocked legal tables for a service unit test's database or transaction double. */
export function legalTablesMock(): {
  legalDocumentVersion: { findMany: ReturnType<typeof vi.fn> };
  legalAcceptance: { create: ReturnType<typeof vi.fn> };
  consentEvent: { create: ReturnType<typeof vi.fn> };
  userRole: { findUnique: ReturnType<typeof vi.fn> };
} {
  return {
    legalDocumentVersion: { findMany: vi.fn().mockResolvedValue(currentLegalVersionRows) },
    legalAcceptance: { create: vi.fn().mockResolvedValue({ id: "a0000000-0000-4000-8000-0000000000aa" }) },
    consentEvent: { create: vi.fn().mockResolvedValue({ id: "a0000000-0000-4000-8000-0000000000bb" }) },
    userRole: { findUnique: vi.fn().mockResolvedValue(null) },
  };
}

/** Sets the required checkbox and the version pair the way an account-creation screen submits them. */
export function setLegalAcceptanceFields(formData: FormData): FormData {
  formData.set("acceptLegal", "on");
  formData.set("legalTermsVersionId", TERMS_VERSION_ID);
  formData.set("legalPrivacyVersionId", PRIVACY_VERSION_ID);
  return formData;
}
