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
  PatientDirectoryItem,
  PatientDirectoryPage,
  PatientDirectoryScope,
} from "@/modules/patient-directory/services/patient-directory-query-service";

type PatientDirectoryViewProps = {
  scopes: readonly PatientDirectoryScope[];
  selectedScope: PatientDirectoryScope;
  lookupType: PatientDirectoryLookupType;
  value: string;
  result: PatientDirectoryPage | null;
  errorMessage: string | null;
};

function directoryUrl(input: {
  hospitalId: string;
  lookupType: PatientDirectoryLookupType;
  value: string;
  page: number;
}): string {
  const params = new URLSearchParams({
    hospitalId: input.hospitalId,
    lookupType: input.lookupType,
  });

  if (input.value) {
    params.set("value", input.value);
  }

  if (input.page > 1) {
    params.set("page", String(input.page));
  }

  return `/app/patients?${params.toString()}`;
}

function displayHospitalNumber(hospitalNumber: string | null): string {
  return hospitalNumber ?? "ไม่ระบุ";
}

function PatientDirectoryList({
  items,
}: {
  items: readonly PatientDirectoryItem[];
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-surface">
      <ul className="divide-y divide-border" aria-label="รายชื่อผู้ป่วย">
        {items.map((item) => (
          <li key={item.patientHospitalRelationshipId}>
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
                  <dd className="font-semibold text-text">{displayHospitalNumber(item.hospitalNumber)}</dd>
                </dl>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PatientDirectoryPagination({
  result,
}: {
  result: PatientDirectoryPage;
}): React.JSX.Element | null {
  if (result.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="หน้ารายชื่อผู้ป่วย"
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
              hospitalId: result.hospital.hospitalId,
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
              hospitalId: result.hospital.hospitalId,
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

export function PatientDirectoryView({
  scopes,
  selectedScope,
  lookupType,
  value,
  result,
  errorMessage,
}: PatientDirectoryViewProps): React.JSX.Element {
  const lookupLabel = lookupType === "HOSPITAL_NUMBER" ? "HN" : "ชื่อผู้ป่วย";
  const maxLength =
    lookupType === "HOSPITAL_NUMBER"
      ? PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH
      : PATIENT_DIRECTORY_NAME_MAX_LENGTH;

  return (
    <div className="max-w-6xl">
      <PageHeader
        actions={<StatusBadge variant="info">อ่านข้อมูล</StatusBadge>}
        breadcrumbs={[{ label: "ผู้ป่วย" }, { label: "รายชื่อผู้ป่วย" }]}
        description="ค้นหาและเปิดดูข้อมูลผู้ป่วยเฉพาะในโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง"
        title="รายชื่อผู้ป่วย"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-muted">โรงพยาบาลที่ดำเนินการ</p>
              {scopes.length > 1 ? (
                <form className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
                  <label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold sm:min-w-80">
                    <span className="sr-only">เลือกโรงพยาบาล</span>
                    <Select defaultValue={selectedScope.hospitalId} name="hospitalId">
                      {scopes.map((scope) => (
                        <option key={scope.hospitalId} value={scope.hospitalId}>
                          {scope.hospitalName}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button size="compact" type="submit" variant="secondary">
                    เลือกโรงพยาบาล
                  </Button>
                </form>
              ) : (
                <p className="mt-2 text-lg font-semibold text-brand-strong">
                  {selectedScope.hospitalName}
                </p>
              )}
            </div>
            <p className="max-w-xl text-sm leading-6 text-text-muted">
              ระบบตรวจสอบสิทธิ์ของคุณและขอบเขตโรงพยาบาลจากข้อมูลฝั่งเซิร์ฟเวอร์ทุกครั้ง
            </p>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ค้นหาผู้ป่วย</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ค้นหาชื่อจากบางส่วน หรือค้นหา HN แบบตรงตัวภายในโรงพยาบาลที่เลือก
          </p>
          <form className="mt-5 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_auto] lg:items-end" method="get">
            <input name="hospitalId" type="hidden" value={selectedScope.hospitalId} />
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
            จำกัดความยาวคำค้นหาเพื่อให้การค้นหาปลอดภัยและตอบสนองได้สม่ำเสมอ
          </p>
          {errorMessage ? (
            <Alert className="mt-5" variant="danger">
              <p className="font-semibold">ไม่สามารถค้นหาได้</p>
              <p className="mt-1">{errorMessage}</p>
            </Alert>
          ) : null}
        </Panel>

        {result ? (
          <section aria-labelledby="patient-directory-results-heading" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]" id="patient-directory-results-heading">
                  รายชื่อผู้ป่วย
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  โรงพยาบาล: {result.hospital.hospitalName}
                </p>
              </div>
              <p className="text-sm text-text-muted">พบ {result.total} รายการ</p>
            </div>

            {result.items.length > 0 ? (
              <div className="mt-4 space-y-5">
                <PatientDirectoryList items={result.items} />
                <PatientDirectoryPagination result={result} />
              </div>
            ) : (
              <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
                <p className="font-semibold text-text">
                  {result.value ? "ไม่พบผู้ป่วยตามข้อมูลค้นหา" : "ยังไม่มีผู้ป่วยในโรงพยาบาลนี้"}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  ลองตรวจสอบคำค้นหา หรือเลือกโรงพยาบาลอื่นที่อยู่ในขอบเขตของคุณ
                </p>
              </div>
            )}
          </section>
        ) : null}

        {result && result.value ? (
          <Link
            className="inline-flex font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href={`/app/patients?hospitalId=${encodeURIComponent(result.hospital.hospitalId)}`}
          >
            ล้างการค้นหา
          </Link>
        ) : null}
      </div>
    </div>
  );
}
