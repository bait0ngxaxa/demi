import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClassName } from "@/components/ui/button";
import { parentChildSummaryFields } from "@/modules/reporting/projections/parent-child-summary-fields";
import { getParentAreaOverviewContext } from "@/modules/reporting/transport/parent-area-overview-context";

export async function NetworkReportWorkspace(): Promise<React.JSX.Element> {
  const groups = await getParentAreaOverviewContext();
  const count = groups.reduce((sum, group) => sum + group.children.length, 0);
  return <div className="content-workspace min-w-0">
    <PageHeader description="รายงานสรุปแยกตามโรงพยาบาลลูกข่ายในเครือข่ายปัจจุบัน" title="รายงานโรงพยาบาล" breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "รายงานโรงพยาบาล", href: "/app/hospitals/reporting" }, { label: "ลูกข่าย" }]} />
    <nav aria-label="ขอบเขตรายงาน" className="mt-5 flex flex-wrap gap-2">
      <Link className={buttonClassName({ variant: "secondary" })} href="/app/hospitals/reporting">โรงพยาบาลของฉัน</Link>
      <Link aria-current="page" className={buttonClassName({ variant: "primary" })} href="/app/hospitals/reporting?scope=network">ลูกข่าย ({count})</Link>
    </nav>
    <p className="mt-4 text-sm text-text-muted">สรุป 9 ค่าของแต่ละลูกข่าย เฉพาะผู้ที่ยังอยู่ในการดูแล เลือกชื่อโรงพยาบาลเพื่อเปิดรายงานและส่งออก Excel</p>
    {groups.map((group) => <section className="mt-6 min-w-0" key={group.parent.id} aria-labelledby={`network-${group.parent.id}`}>
      <h2 className="mb-3 text-xl font-semibold" id={`network-${group.parent.id}`}>{group.parent.name}</h2>
      {group.areas.length === 0 ? <p className="rounded-panel border border-border p-5 text-text-muted">ยังไม่มีลูกข่ายที่พร้อมแสดงรายงาน</p> :
        <table className="block w-full min-w-0 border-collapse text-sm xl:table">
          <caption className="sr-only">รายงานสรุปลูกข่ายของ {group.parent.name}</caption>
          <thead className="sr-only xl:not-sr-only xl:table-header-group"><tr><th scope="col" className="p-2 text-left">โรงพยาบาลลูกข่าย</th>{parentChildSummaryFields(group.areas[0].content).map((field) => <th scope="col" className="p-2 text-right" key={field.key}>{field.label}</th>)}</tr></thead>
          <tbody className="block xl:table-row-group">{group.areas.map((area) => <tr className="mb-4 grid min-w-0 grid-cols-2 border-b border-border xl:table-row" key={area.hospital.id}>
            <th scope="row" className="col-span-2 min-w-0 p-3 text-left xl:table-cell"><Link className="inline-flex min-h-11 items-center break-words font-semibold text-brand-strong underline underline-offset-4 focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/hospitals/reporting?scope=network&target=${encodeURIComponent(`PARENT_CHILD:${group.parent.id}:${area.hospital.id}`)}`}>{area.hospital.name}</Link></th>
            {parentChildSummaryFields(area.content).map((field) => <td className="min-w-0 p-3 align-top xl:text-right" key={field.key}><span className="mb-1 block break-words text-text-muted xl:hidden">{field.label}</span><span className="tabular-nums font-semibold">{field.value.toLocaleString("th-TH")}</span></td>)}
          </tr>)}</tbody>
        </table>}
    </section>)}
  </div>;
}
