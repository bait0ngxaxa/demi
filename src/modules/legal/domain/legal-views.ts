import type { LegalDocumentKind } from "@prisma/client";

import type { ConsentDocumentKind } from "./legal-documents";

/** Client-safe projection of one published version (dates as ISO strings). */
export type LegalVersionView = {
  id: string;
  kind: LegalDocumentKind;
  versionLabel: string;
  title: string;
  isPlaceholder: boolean;
  publishedAt: string;
};

/** What an account-creation screen needs to render the required checkbox and the optional consents. */
export type AccountCreationLegalView = {
  terms: LegalVersionView;
  privacy: LegalVersionView;
  /** LG-D6: only PATIENT screens receive the consents; every other screen receives an empty list. */
  consents: Array<LegalVersionView & { kind: ConsentDocumentKind }>;
};

const legalDateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" });
const legalDateTimeFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export function formatLegalDate(iso: string): string {
  return legalDateFormat.format(new Date(iso));
}

export function formatLegalDateTime(iso: string): string {
  return legalDateTimeFormat.format(new Date(iso));
}
