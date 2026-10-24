import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getHospitalWorkContentPageContext } from "@/modules/hospital-content/transport/hospital-content-work-page-context";
import { HOSPITAL_CONTENT_CATEGORY_LABELS } from "@/modules/hospital-content/domain/hospital-content";
import { HospitalContentImageList } from "./hospital-content-image-list";

export const metadata: Metadata = { title: "ข่าวสารและสื่อความรู้ของโรงพยาบาล" };

export default async function HospitalWorkContentPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[]; hospitalId?: string | string[] }> }): Promise<React.JSX.Element> {
  await connection();
  const query = await searchParams;
  const cursor = typeof query.cursor === "string" ? query.cursor : query.cursor === undefined ? undefined : "";
  const hospitalId = typeof query.hospitalId === "string" ? query.hospitalId : query.hospitalId === undefined ? undefined : "";
  const page = await getHospitalWorkContentPageContext(cursor, hospitalId);
  return <div className="min-w-0 max-w-5xl space-y-6">
    <PageHeader title="ข่าวสารและสื่อความรู้" description="เนื้อหาที่เผยแพร่จากโรงพยาบาลที่คุณปฏิบัติงาน" />
    {page.items.length === 0 ? <p className="rounded-panel border border-border p-5 text-text-muted">ยังไม่มีเนื้อหาที่เผยแพร่</p> : <ul className="divide-y divide-border">
      {page.items.map((item) => <li className="min-w-0 py-5 first:pt-0" key={item.id}>
        <Link className="min-h-11 break-words text-lg font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/hospitals/content/${item.id}`}>{item.title}</Link>
        <p className="mt-2 text-sm text-text-muted">{HOSPITAL_CONTENT_CATEGORY_LABELS[item.category]} · {item.hospital.name}</p>
        <HospitalContentImageList imageIds={item.imageIds} title={item.title} />
      </li>)}
    </ul>}
    {page.nextCursor ? <nav aria-label="หน้ารายการข่าวสารและสื่อความรู้">
      <Link className="inline-flex min-h-11 items-center rounded-control font-medium text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/hospitals/content?${hospitalId === undefined ? "" : `hospitalId=${encodeURIComponent(hospitalId)}&`}cursor=${encodeURIComponent(page.nextCursor)}`}>รายการถัดไป</Link>
    </nav> : null}
  </div>;
}
