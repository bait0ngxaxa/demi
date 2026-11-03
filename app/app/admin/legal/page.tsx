import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { LEGAL_DOCUMENT_KINDS, LEGAL_DOCUMENT_TITLES } from "@/modules/legal/domain/legal-documents";
import { formatLegalDate } from "@/modules/legal/domain/legal-views";
import { getAdminLegalVersionsView, type AdminLegalVersionView } from "@/modules/legal/transport/legal-admin-context";

import { LegalDraftCreateForm, UserLegalHistoryLookup } from "./legal-admin-forms";

export const metadata: Metadata = { title: "เอกสารทางกฎหมาย" };

const linkClass =
  "inline-flex min-h-11 items-center rounded-control font-semibold text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

function VersionStatus({ version }: { version: AdminLegalVersionView }): React.JSX.Element {
  if (version.isCurrent) return <StatusBadge variant="success">ฉบับปัจจุบัน</StatusBadge>;
  if (version.status === "DRAFT") return <StatusBadge variant="warning">ร่าง</StatusBadge>;
  return <StatusBadge>ฉบับก่อนหน้า</StatusBadge>;
}

/** ADR-0028 LG-D3: Platform ADMIN maintains the agency-owned texts as versions (draft → preview → publish). */
export default async function AdminLegalPage(): Promise<React.JSX.Element> {
  await connection();
  const versions = await getAdminLegalVersionsView();
  return (
    <div className="content-detail space-y-8 [overflow-wrap:anywhere]">
      <PageHeader
        breadcrumbs={[{ href: "/app", label: "หน้าหลัก" }, { label: "ผู้ดูแลระบบ" }, { label: "เอกสารทางกฎหมาย" }]}
        description="ข้อความเป็นของหน่วยงานผู้ให้บริการ ฉบับที่ประกาศใช้แล้วแก้ไขหรือลบไม่ได้ ต้องสร้างฉบับใหม่แทน"
        title="เอกสารทางกฎหมาย"
      />

      {LEGAL_DOCUMENT_KINDS.map((kind) => {
        const ofKind = versions.filter((version) => version.kind === kind);
        return (
          <section aria-labelledby={`legal-kind-${kind}`} className="space-y-2" key={kind}>
            <h2 className="text-lg font-semibold text-text" id={`legal-kind-${kind}`}>{LEGAL_DOCUMENT_TITLES[kind]}</h2>
            {ofKind.length === 0 ? <p className="text-sm text-text-muted">ยังไม่มีฉบับใด</p> : (
              <ul className="divide-y divide-border border-y border-border">
                {ofKind.map((version) => (
                  <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2" key={version.id}>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-text">
                        ฉบับ {version.versionLabel} <VersionStatus version={version} />
                        {version.isPlaceholder ? <StatusBadge variant="info">ข้อความชั่วคราว</StatusBadge> : null}
                      </p>
                      <p className="text-sm text-text-muted">{version.publishedAt ? `ประกาศใช้ ${formatLegalDate(version.publishedAt)}` : "ยังไม่ประกาศใช้"}</p>
                    </div>
                    <Link className={linkClass} href={`/app/admin/legal/${version.id}`}>{version.status === "DRAFT" ? "แก้ไขและประกาศใช้" : "ดู"}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <LegalDraftCreateForm />
      <UserLegalHistoryLookup />
    </div>
  );
}
