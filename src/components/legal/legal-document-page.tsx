import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { legalDocumentHref } from "@/modules/legal/domain/legal-documents";
import { formatLegalDate, type LegalVersionView } from "@/modules/legal/domain/legal-views";

import { LegalDocumentBody } from "./legal-document-body";

const linkClass =
  "inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

export type LegalDocumentPageProps = {
  document: LegalVersionView & { body: string };
  isCurrent: boolean;
  history: readonly LegalVersionView[];
};

/** Public `/legal/*` page: one published version with its label, effective date and the version history. */
export function LegalDocumentPage({ document, isCurrent, history }: LegalDocumentPageProps): React.JSX.Element {
  return (
    <main className="min-h-svh bg-canvas text-text">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-8 w-1 rounded-full bg-brand" />
          <span className="text-xl font-bold tracking-[-0.03em] text-brand-deep">DEMI</span>
        </div>

        <article className="mt-8 space-y-6 [overflow-wrap:anywhere]">
          <header className="space-y-3 border-b border-border pb-6">
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-[-0.03em] sm:text-3xl">{document.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm leading-6 text-text-muted">
              <span>ฉบับ {document.versionLabel}</span>
              <span aria-hidden="true">·</span>
              <span>มีผลตั้งแต่ <time dateTime={document.publishedAt}>{formatLegalDate(document.publishedAt)}</time></span>
              {isCurrent ? <StatusBadge variant="success">ฉบับปัจจุบัน</StatusBadge> : <StatusBadge>ฉบับก่อนหน้า</StatusBadge>}
            </p>
          </header>

          {document.isPlaceholder ? (
            <Alert variant="warning">
              <p className="font-semibold">ข้อความชั่วคราว</p>
              <p className="mt-1">เอกสารฉบับนี้เป็นร่างที่ระบบใช้ระหว่างรอข้อความจริงจากหน่วยงานผู้ให้บริการ</p>
            </Alert>
          ) : null}
          {!isCurrent ? (
            <Alert variant="info">
              ฉบับนี้ไม่ใช่ฉบับปัจจุบัน <Link className="font-semibold underline underline-offset-4" href={legalDocumentHref(document.kind)}>อ่านฉบับปัจจุบัน</Link>
            </Alert>
          ) : null}

          <LegalDocumentBody body={document.body} />
        </article>

        {history.length > 1 ? (
          <section aria-labelledby="legal-history-heading" className="mt-10 border-t border-border pt-6">
            <h2 className="text-lg font-semibold" id="legal-history-heading">ประวัติฉบับที่ประกาศใช้</h2>
            <ul className="mt-2 divide-y divide-border">
              {history.map((version) => (
                <li className="flex flex-wrap items-center justify-between gap-x-4 py-1" key={version.id}>
                  {version.id === document.id ? (
                    <span aria-current="page" className="inline-flex min-h-11 items-center font-medium">ฉบับ {version.versionLabel}</span>
                  ) : (
                    <Link className={linkClass} href={legalDocumentHref(version.kind, version.versionLabel)}>ฉบับ {version.versionLabel}</Link>
                  )}
                  <span className="text-sm text-text-muted">มีผล {formatLegalDate(version.publishedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-10 border-t border-border pt-6">
          <Link className={linkClass} href="/login">ไปหน้าเข้าสู่ระบบ</Link>
        </p>
      </div>
    </main>
  );
}
