import type { Metadata } from "next";
import { connection } from "next/server";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getPublicLegalDocumentContext } from "@/modules/legal/transport/legal-public-page-context";

export const metadata: Metadata = { title: "ข้อกำหนดและนโยบาย ฉบับก่อนหน้า" };

/** Public: one published version by label (history). Drafts are never served. */
export default async function LegalDocumentVersionPage({ params }: { params: Promise<{ kind: string; versionLabel: string }> }): Promise<React.JSX.Element> {
  await connection();
  const { kind, versionLabel } = await params;
  const context = await getPublicLegalDocumentContext(kind, versionLabel);
  return <LegalDocumentPage {...context} />;
}
