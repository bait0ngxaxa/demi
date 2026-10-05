import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  HOSPITAL_CONTENT_CATEGORY_LABELS,
  HOSPITAL_CONTENT_STATUS_LABELS,
  HOSPITAL_CONTENT_STATUS_VARIANTS,
} from "@/modules/hospital-content/domain/hospital-content";
import type {
  HospitalContentListProjection,
  HospitalContentOwnerHospital,
} from "@/modules/hospital-content/types/hospital-content-projections";

function formatPublisherTime(value: string | null): string {
  if (!value) return "ยังไม่เคยเผยแพร่";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export function HospitalContentListWorkspace({
  hospitals,
  page,
  selectedHospitalId,
}: {
  hospitals: readonly HospitalContentOwnerHospital[];
  page: HospitalContentListProjection;
  selectedHospitalId: string;
}): React.JSX.Element {
  const listHref = `/app/hospitals/knowledge?hospitalId=${encodeURIComponent(selectedHospitalId)}`;
  const createHref = `/app/hospitals/knowledge/new?hospitalId=${encodeURIComponent(selectedHospitalId)}`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={(
          <Link className={buttonClassName()} href={createHref}>
            สร้างข่าวสารและความรู้
          </Link>
        )}
        breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "ข่าวสารและความรู้" }]}
        description="จัดการข้อมูลที่โรงพยาบาลจัดทำและเผยแพร่"
        title="ข่าวสารและความรู้"
      />

      {hospitals.length > 1 ? (
        <form action="/app/hospitals/knowledge" className="mt-6 max-w-xl" method="get">
          <label className="type-label mb-2 block text-text" htmlFor="hospital-content-hospital">
            เลือกโรงพยาบาล
          </label>
          <select
            className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            id="hospital-content-hospital"
            name="hospitalId"
            defaultValue={selectedHospitalId}
          >
            {hospitals.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {hospital.name} ({hospital.hospitalCode})
              </option>
            ))}
          </select>
          <button className={`${buttonClassName({ variant: "secondary" })} mt-3`} type="submit">
            เปลี่ยนโรงพยาบาล
          </button>
        </form>
      ) : null}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold text-text">{page.hospital.name}</h2>
          <p className="mt-1 break-words text-sm text-text-muted">รหัสโรงพยาบาล {page.hospital.hospitalCode}</p>
        </div>
        <Link className={buttonClassName({ variant: "secondary" })} href={listHref}>
          โหลดรายการล่าสุด
        </Link>
      </div>

      {page.items.length === 0 ? (
        <Panel className="mt-6">
          <h2 className="text-lg font-semibold text-text">ยังไม่มีข่าวสารและความรู้</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            สร้างฉบับร่างฉบับแรกเมื่อมีข้อมูลครบ ทั้งหัวข้อ เนื้อหา และหมวดหมู่
          </p>
          <Link className={`${buttonClassName()} mt-5`} href={createHref}>
            สร้างฉบับร่าง
          </Link>
        </Panel>
      ) : (
        <Panel aria-labelledby="hospital-content-list-heading" className="mt-6">
          <h2 className="sr-only" id="hospital-content-list-heading">รายการข่าวสารและความรู้</h2>
          <ul className="divide-y divide-border">
            {page.items.map((item) => (
              <li className="min-w-0 py-5 first:pt-0 last:pb-0" key={item.id}>
                <Link
                  className="block min-w-0 rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  href={`/app/hospitals/knowledge/${item.id}`}
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-lg font-semibold text-text">{item.title}</h3>
                      <p className="mt-1 text-sm text-text-muted">{HOSPITAL_CONTENT_CATEGORY_LABELS[item.category]}</p>
                    </div>
                    <StatusBadge variant={HOSPITAL_CONTENT_STATUS_VARIANTS[item.status]}>
                      {HOSPITAL_CONTENT_STATUS_LABELS[item.status]}
                    </StatusBadge>
                  </div>
                  <dl className="mt-4 grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-text-muted">เผยแพร่ครั้งแรก</dt>
                      <dd className="mt-0.5 break-words text-text">{formatPublisherTime(item.firstPublishedAt)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-text-muted">เผยแพร่ล่าสุด</dt>
                      <dd className="mt-0.5 break-words text-text">{formatPublisherTime(item.latestPublishedAt)}</dd>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-text-muted">ปรับปรุงรายการ</dt>
                      <dd className="mt-0.5 break-words text-text">{formatPublisherTime(item.expectedUpdatedAt)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="mt-4 max-w-3xl text-sm leading-6 text-text-muted">
        รายการเรียงตามการปรับปรุงล่าสุด เมื่อมีการแก้ไข รายการอาจเลื่อนไปอยู่ก่อนหน้าหน้าที่กำลังดู
        ใช้ “โหลดรายการล่าสุด” เพื่อเริ่มตรวจรายการจากหน้าแรกอีกครั้ง
      </p>

      {page.nextCursor ? (
        <nav aria-label="หน้ารายการข่าวสารและความรู้" className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={`${listHref}&cursor=${encodeURIComponent(page.nextCursor)}`}
            rel="next"
          >
            ดูรายการถัดไป
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
