import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getSupportReportDetailContext } from "@/modules/support/transport/support-report-page-context";
import { SUPPORT_REPORT_CATEGORY_LABELS, SUPPORT_REPORT_STATUS_LABELS } from "@/modules/support/domain/support-report";
import { SupportReportStatusControl } from "./support-report-status-control";

export const metadata: Metadata = { title: "รายละเอียดรายงานปัญหา" };

export default async function SupportReportDetailPage({ params }: { params: Promise<{ reportId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const report = await getSupportReportDetailContext((await params).reportId);
  return <article className="min-w-0 max-w-4xl space-y-5 [overflow-wrap:anywhere]">
    <Link className="inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/hospitals/support?hospitalId=${report.hospitalId}`}>กลับไปกล่องรายงาน</Link>
    <PageHeader title="รายละเอียดรายงานปัญหา" description={`${report.hospital.name} (${report.hospital.hospitalCode})`} />
    <dl className="grid gap-3 border-b border-border pb-5 text-sm sm:grid-cols-2"><div><dt className="text-text-muted">หมวดหมู่</dt><dd className="mt-1 font-medium text-text">{SUPPORT_REPORT_CATEGORY_LABELS[report.category]}</dd></div><div><dt className="text-text-muted">สถานะ</dt><dd className="mt-1 font-medium text-text">{SUPPORT_REPORT_STATUS_LABELS[report.status]}</dd></div><div><dt className="text-text-muted">วันที่ส่ง</dt><dd className="mt-1 text-text"><time dateTime={report.createdAt}>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(report.createdAt))}</time></dd></div></dl>
    <p className="max-w-prose whitespace-pre-wrap text-base leading-8 text-text">{report.message}</p>
    <SupportReportStatusControl reportId={report.id} status={report.status} updatedAt={report.updatedAt} />
  </article>;
}
