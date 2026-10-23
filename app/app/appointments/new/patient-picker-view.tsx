import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import type { PatientDirectoryLookupType } from "@/modules/patient-directory/schemas/patient-directory-schemas";
import type { PatientDirectoryItem } from "@/modules/patient-directory/services/patient-directory-query-service";
import type { WorkAppointmentHospitalScope } from "@/modules/appointments/services/work-appointment-query-service";

function pickerHref(input: {
  hospitalId: string;
  lookupType: PatientDirectoryLookupType;
  value: string;
  page: number;
}): string {
  const params = new URLSearchParams({
    hospitalId: input.hospitalId,
    lookupType: input.lookupType,
    page: String(input.page),
  });
  if (input.value) params.set("value", input.value);
  return `/app/appointments/new?${params.toString()}`;
}

export function AppointmentPatientPicker({
  currentPage,
  errorMessage,
  items,
  lookupType,
  scopes,
  selectedScope,
  total,
  totalPages,
  value,
}: {
  currentPage: number;
  errorMessage: string | null;
  items: readonly PatientDirectoryItem[];
  lookupType: PatientDirectoryLookupType;
  scopes: readonly WorkAppointmentHospitalScope[];
  selectedScope: WorkAppointmentHospitalScope | null;
  total: number;
  totalPages: number;
  value: string;
}): React.JSX.Element {
  return (
    <div className="content-workspace space-y-6">
      <PageHeader
        breadcrumbs={[
          { href: "/app/appointments", label: "รายการนัดหมาย" },
          { label: "เลือกผู้ป่วย" },
        ]}
        description="ค้นหาผู้ป่วยด้วยชื่อหรือ HN ในโรงพยาบาลที่คุณมีสิทธิ์สร้างนัด"
        title="เลือกผู้ป่วย"
      />

      {!selectedScope ? (
        <Alert role="status" variant="info">บัญชีนี้ยังไม่มีโรงพยาบาลหรือผู้ป่วยที่สามารถสร้างนัดหมายได้</Alert>
      ) : (
        <>
          <Panel>
            <form action="/app/appointments/new" className="grid gap-4 sm:grid-cols-2" method="get">
              <label className="block space-y-2 text-sm font-semibold text-text">
                โรงพยาบาล
                <Select defaultValue={selectedScope.hospitalId} name="hospitalId">
                  {scopes.map((scope) => <option key={scope.hospitalId} value={scope.hospitalId}>{scope.hospitalName}</option>)}
                </Select>
              </label>
              <label className="block space-y-2 text-sm font-semibold text-text">
                ค้นหาจาก
                <Select defaultValue={lookupType} name="lookupType">
                  <option value="NAME">ชื่อผู้ป่วย</option>
                  <option value="HOSPITAL_NUMBER">HN</option>
                </Select>
              </label>
              <label className="block space-y-2 text-sm font-semibold text-text sm:col-span-2">
                คำค้นหา
                <input
                  autoComplete="off"
                  className="min-h-12 w-full rounded-control border border-border bg-surface px-4 text-base text-text focus:border-action-primary focus:ring-4 focus:ring-focus-ring"
                  defaultValue={value}
                  maxLength={120}
                  name="value"
                  type="search"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Button type="submit">ค้นหาผู้ป่วย</Button>
                <Link className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-strong underline" href={pickerHref({ hospitalId: selectedScope.hospitalId, lookupType: "NAME", value: "", page: 1 })}>ล้างการค้นหา</Link>
              </div>
            </form>
          </Panel>

          {errorMessage ? <Alert role="alert" variant="warning">{errorMessage}</Alert> : null}

          {items.length > 0 ? (
            <section aria-label="ผลการค้นหาผู้ป่วย" className="space-y-3">
              <p className="text-sm text-text-muted">พบ {total.toLocaleString("th-TH")} รายการ</p>
              <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
                {items.map((item) => (
                  <li key={item.patientHospitalRelationshipId}>
                    <Link
                      className="group flex min-h-12 flex-col gap-2 px-5 py-4 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:flex-row sm:items-center sm:justify-between sm:px-7"
                      href={`/app/patients/${encodeURIComponent(item.patientHospitalRelationshipId)}/appointments/new?returnTo=%2Fapp%2Fappointments`}
                      prefetch={false}
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-semibold text-text group-hover:text-brand-strong">{item.displayName}</span>
                        <span className="mt-1 block break-words text-sm text-text-muted">{item.hospital.name}{item.hospitalNumber ? ` · HN ${item.hospitalNumber}` : ""}</span>
                      </span>
                      <span className={buttonClassName({ variant: "secondary", size: "compact" })}>เลือกผู้ป่วย</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <nav aria-label="เปลี่ยนหน้าผลการค้นหา" className="flex flex-wrap justify-center gap-3 pt-2">
                {currentPage > 1 ? <Link className={buttonClassName({ variant: "secondary" })} href={pickerHref({ hospitalId: selectedScope.hospitalId, lookupType, value, page: currentPage - 1 })}>หน้าก่อนหน้า</Link> : null}
                <span className="flex min-h-12 items-center text-sm text-text-muted">หน้า {currentPage.toLocaleString("th-TH")} จาก {totalPages.toLocaleString("th-TH")}</span>
                {currentPage < totalPages ? <Link className={buttonClassName({ variant: "secondary" })} href={pickerHref({ hospitalId: selectedScope.hospitalId, lookupType, value, page: currentPage + 1 })}>หน้าถัดไป</Link> : null}
              </nav>
            </section>
          ) : (
            <div className="rounded-panel border border-dashed border-border bg-surface px-5 py-9 text-center sm:px-7">
              <p className="font-semibold text-text">ไม่พบผู้ป่วยตามคำค้นหานี้</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">ค้นหาด้วยชื่อหรือ HN หรือเลือกโรงพยาบาลอื่นที่คุณมีสิทธิ์</p>
            </div>
          )}
        </>
      )}
      <p className="text-center"><Link className="text-sm font-semibold text-brand-strong underline" href="/app/appointments">กลับไปรายการนัดหมาย</Link></p>
    </div>
  );
}
