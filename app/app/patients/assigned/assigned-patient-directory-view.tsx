import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH,
  PATIENT_DIRECTORY_NAME_MAX_LENGTH,
  type PatientDirectoryLookupType,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import type {
  PatientAssignedDirectoryPage,
  PatientDirectoryItem,
} from "@/modules/patient-directory/services/patient-directory-query-service";

type AssignedPatientDirectoryViewProps = {
  lookupType: PatientDirectoryLookupType;
  value: string;
  result: PatientAssignedDirectoryPage | null;
  errorMessage: string | null;
};

function directoryUrl(input: {
  lookupType: PatientDirectoryLookupType;
  value: string;
  page: number;
}): string {
  const params = new URLSearchParams({ lookupType: input.lookupType });

  if (input.value) {
    params.set("value", input.value);
  }

  if (input.page > 1) {
    params.set("page", String(input.page));
  }

  return `/app/patients/assigned?${params.toString()}`;
}

function PatientRow({ item }: { item: PatientDirectoryItem }): React.JSX.Element {
  return (
    <li>
      <Link
        className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={`/app/patients/${item.patientHospitalRelationshipId}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <h3 className="break-words text-lg font-semibold text-text group-hover:text-brand-strong">
              {item.displayName}
            </h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">{item.hospital.name}</p>
          </div>
          <dl className="shrink-0 text-sm leading-6 sm:text-right">
            <dt className="text-text-muted">HN ของโรงพยาบาลนี้</dt>
            <dd className="font-semibold text-text">{item.hospitalNumber ?? "ไม่ระบุ"}</dd>
          </dl>
        </div>
      </Link>
    </li>
  );
}

function Pagination({ result }: { result: PatientAssignedDirectoryPage }): React.JSX.Element | null {
  if (result.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="หน้าผู้ป่วยที่รับผิดชอบ"
      className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-text-muted">
        หน้า {result.page} จาก {result.totalPages}
      </p>
      <div className="flex gap-3">
        {result.hasPreviousPage ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={directoryUrl({
              lookupType: result.lookupType,
              value: result.value,
              page: result.page - 1,
            })}
          >
            ก่อนหน้า
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-text-subtle">
            ก่อนหน้า
          </span>
        )}
        {result.hasNextPage ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={directoryUrl({
              lookupType: result.lookupType,
              value: result.value,
              page: result.page + 1,
            })}
          >
            ถัดไป
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-text-subtle">
            ถัดไป
          </span>
        )}
      </div>
    </nav>
  );
}

export function AssignedPatientDirectoryView({
  lookupType,
  value,
  result,
  errorMessage,
}: AssignedPatientDirectoryViewProps): React.JSX.Element {
  const lookupLabel = lookupType === "HOSPITAL_NUMBER" ? "HN" : "ชื่อผู้ป่วย";
  const maxLength =
    lookupType === "HOSPITAL_NUMBER"
      ? PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH
      : PATIENT_DIRECTORY_NAME_MAX_LENGTH;

  return (
    <div>
      <PageHeader
        actions={<StatusBadge variant="info">ขอบเขตที่รับผิดชอบ</StatusBadge>}
        breadcrumbs={[{ label: "ผู้ป่วย" }, { label: "ผู้ป่วยที่รับผิดชอบ" }]}
        description="แสดงเฉพาะผู้ป่วยที่ได้รับมอบหมายให้คุณในโรงพยาบาลที่มีความสัมพันธ์ใช้งานอยู่"
        title="ผู้ป่วยที่รับผิดชอบ"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ค้นหาผู้ป่วย</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ค้นหาชื่อจากบางส่วน หรือค้นหา HN แบบตรงตัวในรายการที่ได้รับมอบหมาย
          </p>
          <form className="mt-5 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_auto] lg:items-end" method="get">
            <label className="block space-y-2 text-sm font-semibold">
              <span>ค้นหาด้วย</span>
              <Select defaultValue={lookupType} name="lookupType">
                <option value="NAME">ชื่อผู้ป่วย</option>
                <option value="HOSPITAL_NUMBER">HN</option>
              </Select>
            </label>
            <label className="block space-y-2 text-sm font-semibold">
              <span>{lookupLabel}</span>
              <Input
                defaultValue={value}
                maxLength={maxLength}
                name="value"
                placeholder={lookupType === "HOSPITAL_NUMBER" ? "เช่น HN-001" : "เช่น สมชาย"}
                type="search"
              />
            </label>
            <Button type="submit">ค้นหา</Button>
          </form>
          <p className="mt-3 text-xs leading-5 text-text-subtle">
            แสดงเฉพาะผู้ป่วยที่คุณรับผิดชอบในขณะนี้
          </p>
          {errorMessage ? (
            <Alert className="mt-5" variant="danger">
              <p className="font-semibold">ไม่สามารถค้นหาได้</p>
              <p className="mt-1">{errorMessage}</p>
            </Alert>
          ) : null}
        </Panel>

        {result ? (
          <section aria-labelledby="assigned-patient-results-heading" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]" id="assigned-patient-results-heading">
                  รายชื่อผู้ป่วยที่รับผิดชอบ
                </h2>
                <p className="mt-1 text-sm text-text-muted">รวมทุกโรงพยาบาลที่คุณมีสิทธิ์และผู้ป่วยที่ได้รับมอบหมาย</p>
              </div>
              <p className="text-sm text-text-muted">พบ {result.total} รายการ</p>
            </div>

            {result.items.length > 0 ? (
              <div className="mt-4 space-y-5">
                <div className="overflow-hidden rounded-panel border border-border bg-surface">
                  <ul className="divide-y divide-border" aria-label="รายชื่อผู้ป่วยที่รับผิดชอบ">
                    {result.items.map((item) => (
                      <PatientRow item={item} key={item.patientHospitalRelationshipId} />
                    ))}
                  </ul>
                </div>
                <Pagination result={result} />
              </div>
            ) : (
              <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
                <p className="font-semibold text-text">
                  {result.value ? "ไม่พบผู้ป่วยตามข้อมูลค้นหา" : "ยังไม่มีผู้ป่วยที่ได้รับมอบหมาย"}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  หากต้องการให้มีผู้ป่วยในรายการนี้ กรุณาติดต่อเจ้าของโรงพยาบาลเพื่อจัดการการมอบหมายผู้ป่วย
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
