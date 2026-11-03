import type { Metadata } from "next";
import { connection } from "next/server";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getPublicLegalDocumentContext } from "@/modules/legal/transport/legal-public-page-context";

export const metadata: Metadata = { title: "ข้อกำหนดและนโยบาย" };

/** Public: `/legal/terms`, `/legal/privacy`, `/legal/health-data-consent`, `/legal/marketing-consent` (current version). */
export default async function CurrentLegalDocumentPage({ params }: { params: Promise<{ kind: string }> }): Promise<React.JSX.Element> {
  await connection();
  const context = await getPublicLegalDocumentContext((await params).kind);
  return <LegalDocumentPage {...context} />;
}
