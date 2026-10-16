import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getSupportInboxContext } from "@/modules/support/transport/support-report-page-context";
import { SUPPORT_REPORT_CATEGORY_LABELS, SUPPORT_REPORT_STATUS_LABELS } from "@/modules/support/domain/support-report";

export const metadata: Metadata = { title: "รายงานปัญหาจากผู้ใช้งาน" };

export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  const requested = typeof params.hospitalId === "string" ? params.hospitalId : undefined;
  const cursor = typeof params.cursor === "string" ? params.cursor : params.cursor === undefined ? undefined : "";
  const { hospitals, selectedId, page } = await getSupportInboxContext(requested, cursor);
  return <div className="min-w-0 max-w-5xl space-y-6">
    <PageHeader title="รายงานปัญหาจากผู้ใช้งาน" description="ตรวจสอบและติดตามสถานะของรายงานในโรงพยาบาลที่คุณเป็นเจ้าของ" />
    {hospitals.length > 1 ? <nav aria-label="เลือกโรงพยาบาล" className="flex flex-wrap gap-3">{hospitals.map((hospital) => <Link aria-current={hospital.id === selectedId ? "page" : undefined} className="min-h-11 rounded-control px-3 py-2 font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/hospitals/support?hospitalId=${hospital.id}`} key={hospital.id}>{hospital.name}</Link>)}</nav> : <p className="text-sm text-text-muted">{page.hospital.name}</p>}
    {page.items.length === 0 ? <p className="rounded-panel border border-border p-5 text-text-muted">ยังไม่มีรายงานปัญหา</p> : <ul className="divide-y divide-border">{page.items.map((item) => <li className="py-4" key={item.id}><Link className="min-h-11 break-words font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/hospitals/support/${item.id}`}>{SUPPORT_REPORT_CATEGORY_LABELS[item.category]} · {SUPPORT_REPORT_STATUS_LABELS[item.status]}</Link><p className="mt-1 text-sm text-text-muted"><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(item.createdAt))}</time></p></li>)}</ul>}
    {page.nextCursor ? <nav aria-label="หน้ารายการรายงานปัญหา"><Link className="inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/hospitals/support?hospitalId=${selectedId}&cursor=${encodeURIComponent(page.nextCursor)}`}>ดูรายงานเก่ากว่า</Link></nav> : null}
  </div>;
}
