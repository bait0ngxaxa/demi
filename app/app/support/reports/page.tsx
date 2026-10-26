import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SupportReportList } from "@/components/support/support-report-list";
import { PageHeader } from "@/components/ui/page-header";
import { getSupportHistoryContext } from "@/modules/support/transport/support-report-page-context";

export const metadata: Metadata = { title: "รายงานปัญหาที่ส่งแล้ว" };

const linkClassName = "inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

/** D4 (Product Owner 2026-10-26): the reporter's own reports and their current status, newest first. */
export default async function SupportReportHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : params.cursor === undefined ? undefined : "";
  const page = await getSupportHistoryContext(cursor);
  return <div className="min-w-0 max-w-4xl space-y-6">
    <Link className={linkClassName} href="/app/support">กลับไปแจ้งปัญหา</Link>
    <PageHeader title="รายงานปัญหาที่ส่งแล้ว" description="ติดตามสถานะรายงานที่คุณส่งถึงผู้ดูแลระบบ DEMI" />
    <SupportReportList detailHref={(id) => `/app/support/reports/${id}`} emptyText="ยังไม่มีรายงานที่ส่ง" items={page.items} />
    {page.nextCursor ? <nav aria-label="หน้ารายการรายงานที่ส่งแล้ว"><Link className={linkClassName} href={`/app/support/reports?cursor=${encodeURIComponent(page.nextCursor)}`}>ดูรายงานเก่ากว่า</Link></nav> : null}
  </div>;
}
