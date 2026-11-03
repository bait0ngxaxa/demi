import type { Metadata } from "next";
import { connection } from "next/server";

import { LegalDocumentBody } from "@/components/legal/legal-document-body";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { LEGAL_DOCUMENT_TITLES } from "@/modules/legal/domain/legal-documents";
import { formatLegalDate } from "@/modules/legal/domain/legal-views";
import { getAdminLegalVersionView } from "@/modules/legal/transport/legal-admin-context";

import { LegalDraftEditor } from "../legal-admin-forms";

export const metadata: Metadata = { title: "ฉบับเอกสารทางกฎหมาย" };

export default async function AdminLegalVersionPage({ params }: { params: Promise<{ versionId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const version = await getAdminLegalVersionView((await params).versionId);
  return (
    <div className="content-detail space-y-6 [overflow-wrap:anywhere]">
      <PageHeader
        breadcrumbs={[{ href: "/app", label: "หน้าหลัก" }, { href: "/app/admin/legal", label: "เอกสารทางกฎหมาย" }, { label: `ฉบับ ${version.versionLabel}` }]}
        description={LEGAL_DOCUMENT_TITLES[version.kind]}
        title={version.status === "DRAFT" ? `ร่างฉบับ ${version.versionLabel}` : `ฉบับ ${version.versionLabel}`}
      />
      {version.status === "DRAFT" ? <LegalDraftEditor version={version} /> : (
        <>
          <Alert variant={version.isCurrent ? "success" : "neutral"}>
            {version.isCurrent ? "ฉบับปัจจุบัน" : "ฉบับก่อนหน้า"} · ประกาศใช้ {version.publishedAt ? formatLegalDate(version.publishedAt) : ""} · แก้ไขไม่ได้
          </Alert>
          <article className="rounded-panel border border-border bg-surface px-5 py-5 sm:px-7">
            <h2 className="text-xl font-bold tracking-[-0.02em] text-text">{version.title}</h2>
            <div className="mt-5"><LegalDocumentBody body={version.body} /></div>
          </article>
        </>
      )}
    </div>
  );
}
