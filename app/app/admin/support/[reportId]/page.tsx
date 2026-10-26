import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { roleLabels } from "@/components/app-shell/actor-presentation";
import { PageHeader } from "@/components/ui/page-header";
import { SupportReportStatusBadge } from "@/components/support/support-report-status-badge";
import { SUPPORT_REPORT_CATEGORY_LABELS, SUPPORT_REPORT_INBOX_ALL_STATUSES } from "@/modules/support/domain/support-report";
import { getAdminSupportReportDetailContext } from "@/modules/support/transport/support-report-page-context";
import { SupportReportStatusControl } from "./support-report-status-control";

export const metadata: Metadata = { title: "รายละเอียดรายงานปัญหา" };

const linkClassName = "inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

export default async function AdminSupportReportDetailPage({ params }: { params: Promise<{ reportId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const report = await getAdminSupportReportDetailContext((await params).reportId);
  return <article className="min-w-0 max-w-4xl space-y-5 [overflow-wrap:anywhere]">
    <Link className={linkClassName} href="/app/admin/support">กลับไปกล่องแจ้งปัญหา</Link>
    <PageHeader title="รายละเอียดรายงานปัญหา" description={report.hospital?.name ?? "ไม่เจาะจงโรงพยาบาล"} />
    <dl className="grid gap-3 border-b border-border pb-5 text-sm sm:grid-cols-2">
      <div><dt className="text-text-muted">หมวดหมู่</dt><dd className="mt-1 font-medium text-text">{SUPPORT_REPORT_CATEGORY_LABELS[report.category]}</dd></div>
      <div><dt className="text-text-muted">สถานะ</dt><dd className="mt-1"><SupportReportStatusBadge status={report.status} /></dd></div>
      {/* WB-DF-14 P2 (Product Owner 2026-10-26): name and current roles only; no identifier or contact detail. */}
      <div><dt className="text-text-muted">ผู้แจ้ง</dt><dd className="mt-1 font-medium text-text">{report.reporter.displayName}</dd></div>
      <div><dt className="text-text-muted">บทบาทของผู้แจ้ง</dt><dd className="mt-1 text-text">{report.reporter.roles.length > 0 ? report.reporter.roles.map((role) => roleLabels[role]).join(" · ") : "ไม่มีบทบาทในระบบ"}</dd></div>
      <div><dt className="text-text-muted">วันที่ส่ง</dt><dd className="mt-1 text-text"><time dateTime={report.createdAt}>{formatDateTime(report.createdAt)}</time></dd></div>
      {report.hospital ? <div><dt className="text-text-muted">โรงพยาบาลที่ผู้แจ้งเลือก</dt><dd className="mt-1 text-text">{report.hospital.name} ({report.hospital.hospitalCode})</dd><dd><Link className={linkClassName} href={`/app/admin/support?status=${SUPPORT_REPORT_INBOX_ALL_STATUSES}&hospitalId=${encodeURIComponent(report.hospital.id)}`}>ดูรายงานอื่นของโรงพยาบาลนี้</Link></dd></div> : null}
    </dl>
    <section aria-labelledby="support-report-message-heading" className="space-y-2">
      <h2 className="text-lg font-semibold text-text" id="support-report-message-heading">ข้อความจากผู้แจ้ง</h2>
      <p className="max-w-prose whitespace-pre-wrap rounded-panel border border-border bg-surface px-5 py-4 text-base leading-8 text-text">{report.message}</p>
    </section>
    <SupportReportStatusControl reportId={report.id} status={report.status} updatedAt={report.updatedAt} />
  </article>;
}
