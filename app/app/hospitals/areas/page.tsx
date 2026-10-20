import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { parentChildSummaryFields } from "@/modules/reporting/projections/parent-child-summary-fields";
import { getParentAreaOverviewContext } from "@/modules/reporting/transport/parent-area-overview-context";

import { ExportButton } from "../reporting/hospital-report-workspace";

export const metadata: Metadata = { title: "เขตความรับผิดชอบ" };

export default async function ParentAreaOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  if (Object.keys(await searchParams).length > 0) notFound();
  const groups = await getParentAreaOverviewContext();

  return (
    <div className="content-workspace">
      <PageHeader
        breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "เขตความรับผิดชอบ" }]}
        description="เขตความรับผิดชอบคือลูกข่ายที่อยู่ในเครือข่ายของโรงพยาบาลแม่ข่ายของคุณ แสดงตัวเลขสรุป 9 ค่าของแต่ละแห่ง"
        title="เขตความรับผิดชอบ"
      />

      <Alert className="mt-5" variant="info">
        หน้านี้แสดงตัวเลขสรุป ดูรายชื่อและข้อมูลผู้ป่วยของลูกข่าย (อ่านอย่างเดียว) หรือเพิ่มและนำลูกข่ายออกได้ที่หน้า{" "}
        <Link className="font-semibold underline" href="/app/hospitals/network" prefetch={false}>จัดการลูกข่าย</Link>
      </Alert>

      {groups.map((group) => (
        <section aria-labelledby={`area-network-${group.parent.id}`} className="mt-7 min-w-0" key={group.parent.id}>
          <h2 className="break-words text-xl font-semibold text-text" id={`area-network-${group.parent.id}`}>
            เครือข่าย {group.parent.name}
          </h2>
          {group.areas.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-text-muted">
              ยังไม่มีลูกข่ายในเครือข่ายนี้ เพิ่มลูกข่ายได้ที่หน้าจัดการลูกข่าย
            </p>
          ) : (
            <ul className="mt-4 grid min-w-0 gap-4">
              {group.areas.map((area) => (
                <li className="min-w-0" key={area.hospital.id}>
                  <Panel aria-labelledby={`area-${area.hospital.id}`} className="min-w-0">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="break-words text-lg font-semibold text-text" id={`area-${area.hospital.id}`}>
                          {area.hospital.name}
                        </h3>
                        <StatusBadge className="mt-2" variant="success">ลูกข่ายใช้งานอยู่</StatusBadge>
                      </div>
                      <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
                        <Link
                          className={buttonClassName({ variant: "secondary", size: "compact" })}
                          href={`/app/hospitals/reporting?target=${encodeURIComponent(`PARENT_CHILD:${group.parent.id}:${area.hospital.id}`)}`}
                          prefetch={false}
                        >
                          เปิดรายงานสรุป
                        </Link>
                        <ExportButton
                          accessibleLabel={`ส่งออก Excel ตัวเลขสรุปของ ${area.hospital.name}`}
                          endpoint="/api/v1/hospital/reporting/parent-child/export"
                          hospitalId={area.hospital.id}
                          parentHospitalId={group.parent.id}
                        />
                      </div>
                    </div>
                    <dl className="mt-4 grid min-w-0 gap-x-5 gap-y-3 sm:grid-cols-2 @5xl/workspace:grid-cols-3">
                      {parentChildSummaryFields(area.content).map((field) => (
                        <div className="min-w-0" key={field.key}>
                          <dt className="text-sm leading-5 text-text-muted">{field.label}</dt>
                          <dd className="mt-1 tabular-nums text-lg font-semibold text-text">{field.value.toLocaleString("th-TH")}</dd>
                        </div>
                      ))}
                    </dl>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
