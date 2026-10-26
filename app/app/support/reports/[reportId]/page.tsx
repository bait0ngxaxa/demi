import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { SupportReportStatusBadge } from "@/components/support/support-report-status-badge";
import { SUPPORT_REPORT_CATEGORY_LABELS } from "@/modules/support/domain/support-report";
import { getSupportHistoryDetailContext } from "@/modules/support/transport/support-report-page-context";

export const metadata: Metadata = { title: "รายงานปัญหาที่ส่งแล้ว" };

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

export default async function SupportReportHistoryDetailPage({ params }: { params: Promise<{ reportId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const report = await getSupportHistoryDetailContext((await params).reportId);
  return <article className="min-w-0 max-w-4xl space-y-5 [overflow-wrap:anywhere]">
    <Link className="inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href="/app/support/reports">กลับไปรายงานที่ส่งแล้ว</Link>
    <PageHeader title="รายงานปัญหาที่ส่งแล้ว" description={report.hospital?.name ?? "ไม่เจาะจงโรงพยาบาล"} />
    <dl className="grid gap-3 border-b border-border pb-5 text-sm sm:grid-cols-2"><div><dt className="text-text-muted">หมวดหมู่</dt><dd className="mt-1 font-medium text-text">{SUPPORT_REPORT_CATEGORY_LABELS[report.category]}</dd></div><div><dt className="text-text-muted">สถานะ</dt><dd className="mt-1"><SupportReportStatusBadge status={report.status} /></dd></div><div><dt className="text-text-muted">วันที่ส่ง</dt><dd className="mt-1 text-text"><time dateTime={report.createdAt}>{formatDateTime(report.createdAt)}</time></dd></div>{report.resolvedAt ? <div><dt className="text-text-muted">วันที่แก้ไขแล้ว</dt><dd className="mt-1 text-text"><time dateTime={report.resolvedAt}>{formatDateTime(report.resolvedAt)}</time></dd></div> : null}</dl>
    <section aria-labelledby="support-report-message-heading" className="space-y-2">
      <h2 className="text-lg font-semibold text-text" id="support-report-message-heading">ข้อความที่คุณส่ง</h2>
      <p className="max-w-prose whitespace-pre-wrap rounded-panel border border-border bg-surface px-5 py-4 text-base leading-8 text-text">{report.message}</p>
    </section>
  </article>;
}
