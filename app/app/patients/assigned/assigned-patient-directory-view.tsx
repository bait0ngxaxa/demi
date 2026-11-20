import Form from "next/form";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageNumberPagination } from "@/components/ui/page-number-pagination";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH,
  PATIENT_DIRECTORY_NAME_MAX_LENGTH,
  type PatientDirectoryClassificationFilter,
  type PatientDirectoryLookupType,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import { getPatientClassificationLabel } from "@/modules/patient-classification/presentation/patient-classification-labels";
import type {
  PatientAssignedDirectoryItem,
  PatientAssignedDirectoryPage,
} from "@/modules/patient-directory/services/patient-directory-query-service";

type AssignedPatientDirectoryViewProps = {
  lookupType: PatientDirectoryLookupType;
  value: string;
  result: PatientAssignedDirectoryPage | null;
  errorMessage: string | null;
  classificationFilter: PatientDirectoryClassificationFilter;
};

// CT-3 / OSM-SCREENING-IN-ROUND1: the former "followup" and "screening" modes are the จัดบริการ workspace
// (/app/services); screening is recorded in Program round 1 there. This list only opens the Patient.

function directoryUrl(input: {
  lookupType: PatientDirectoryLookupType;
  value: string;
  page: number;
  classification: PatientDirectoryClassificationFilter;
  hospitalId: string | null;
}): string {
  const params = new URLSearchParams({ lookupType: input.lookupType });

  if (input.hospitalId) {
    params.set("hospitalId", input.hospitalId);
  }

  if (input.value) {
    params.set("value", input.value);
  }

  if (input.page > 1) {
    params.set("page", String(input.page));
  }

  if (input.classification !== "ALL") {
    params.set("classification", input.classification);
  }

  return `/app/patients/assigned?${params.toString()}`;
}

function PatientRow({ item }: { item: PatientAssignedDirectoryItem }): React.JSX.Element {
  const href = `/app/patients/${encodeURIComponent(item.patientHospitalRelationshipId)}`;

  return (
    <li>
      <Link
        className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={href}
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h3 className="break-words text-lg font-semibold text-text group-hover:text-brand-strong">
              {item.displayName}
            </h3>
            <p className="mt-1 break-words text-sm leading-6 text-text-muted">โรงพยาบาล: {item.hospital.name}</p>
            <dl className="mt-2 text-sm leading-6">
              <dt className="inline text-text-muted">HN ของโรงพยาบาลนี้: </dt>
              <dd className="inline break-words font-semibold text-text">{item.hospitalNumber ?? "ไม่ระบุ"}</dd>
            </dl>
          </div>
          <div className="min-w-0 sm:text-right">
            <p className="text-xs text-text-muted">สถานะผู้ป่วย</p>
            <StatusBadge variant={item.classification ? "info" : "neutral"}>
              {getPatientClassificationLabel(item.classification)}
            </StatusBadge>
            <p className="mt-3 text-sm font-semibold text-brand-strong">
              เปิดผู้ป่วยเพื่อดูแลต่อ
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Pagination({ result }: { result: PatientAssignedDirectoryPage }): React.JSX.Element | null {
  return (
    <PageNumberPagination
      label="หน้าผู้ป่วยที่รับผิดชอบ"
      page={result.page}
      totalPages={result.totalPages}
      getPageTarget={(page) => ({ href: directoryUrl({
        lookupType: result.lookupType,
        value: result.value,
        page,
        classification: result.classificationFilter,
        hospitalId: result.hospitalFilter?.hospitalId ?? null,
      }) })}
    />
  );
}

export function AssignedPatientDirectoryView({
  lookupType,
  value,
  result,
  errorMessage,
  classificationFilter,
}: AssignedPatientDirectoryViewProps): React.JSX.Element {
  const lookupLabel = lookupType === "HOSPITAL_NUMBER" ? "HN" : "ชื่อผู้ป่วย";
  const maxLength =
    lookupType === "HOSPITAL_NUMBER"
      ? PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH
      : PATIENT_DIRECTORY_NAME_MAX_LENGTH;
  const hasFilters = Boolean(result?.value) || (result?.classificationFilter ?? classificationFilter) !== "ALL";
  const hospitalFilter = result?.hospitalFilter ?? null;
  const clearSearchParams = new URLSearchParams();
  if (hospitalFilter) clearSearchParams.set("hospitalId", hospitalFilter.hospitalId);
  const clearSearchHref = `/app/patients/assigned${clearSearchParams.size > 0 ? `?${clearSearchParams.toString()}` : ""}`;

  return (
    <div className="content-workspace break-words">
      <PageHeader
        actions={<StatusBadge variant="info">ผู้ป่วยที่คุณดูแล</StatusBadge>}
        breadcrumbs={[{ href: "/app", label: "พื้นที่ทำงาน" }, { label: "ผู้ป่วยที่รับผิดชอบ" }]}
        title="ผู้ป่วยที่รับผิดชอบ"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ค้นหาผู้ป่วย</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ชื่อพิมพ์บางส่วนได้ HN ต้องตรงทั้งหมด
          </p>
          <Form action="/app/patients/assigned" className="mt-5 grid gap-4 @5xl/workspace:grid-cols-[13rem_minmax(0,1fr)_13rem] @5xl/workspace:items-end">
            {hospitalFilter ? <input name="hospitalId" type="hidden" value={hospitalFilter.hospitalId} /> : null}
            <label className="block space-y-2 text-sm font-semibold">
              <span>ค้นหาด้วย</span>
              <Select defaultValue={lookupType} key={lookupType} name="lookupType">
                <option value="NAME">ชื่อผู้ป่วย</option>
                <option value="HOSPITAL_NUMBER">HN</option>
              </Select>
            </label>
            <label className="block space-y-2 text-sm font-semibold">
              <span>{lookupLabel}</span>
              <Input
                defaultValue={value}
                key={value}
                maxLength={maxLength}
                name="value"
                placeholder={lookupType === "HOSPITAL_NUMBER" ? "เช่น HN-001" : "เช่น สมชาย"}
                type="search"
              />
            </label>
            <label className="block space-y-2 text-sm font-semibold">
              <span>สถานะผู้ป่วย</span>
              <Select defaultValue={classificationFilter} key={classificationFilter} name="classification">
                <option value="ALL">ทั้งหมด</option>
                <option value="RISK">กลุ่มเสี่ยง</option>
                <option value="DIABETES">เบาหวาน</option>
              </Select>
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap @5xl/workspace:col-span-3">
              <PendingSubmitButton pendingLabel="กำลังค้นหา...">ค้นหา</PendingSubmitButton>
              {hasFilters || errorMessage ? (
                <Link
                  className={buttonClassName({ variant: "secondary", size: "compact" })}
                  href={clearSearchHref}
                >
                  ล้างการค้นหาและตัวกรอง
                </Link>
              ) : null}
            </div>
          </Form>
          {errorMessage ? (
            <Alert className="mt-5" variant="danger">
              <p className="font-semibold">ไม่สามารถค้นหาได้</p>
              <p className="mt-1">{errorMessage}</p>
            </Alert>
          ) : null}
        </Panel>

        {result && hospitalFilter ? (
          <div className="flex min-w-0 flex-col gap-2 rounded-panel border border-border bg-surface-muted px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="text-sm leading-6 text-text">
              {hospitalFilter.hospitalName
                ? <>แสดงเฉพาะผู้ป่วยของ<span className="font-semibold">{hospitalFilter.hospitalName}</span></>
                : "ไม่พบโรงพยาบาลที่เลือก"}
            </p>
            <Link
              className="inline-flex min-h-11 shrink-0 items-center rounded-control text-sm font-semibold text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={directoryUrl({
                lookupType: result.lookupType,
                value: result.value,
                page: 1,
                classification: result.classificationFilter,
                hospitalId: null,
              })}
            >
              ดูผู้ป่วยจากทุกโรงพยาบาล
            </Link>
          </div>
        ) : null}

        {result ? (
          <section aria-labelledby="assigned-patient-results-heading" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]" id="assigned-patient-results-heading">
                  รายชื่อผู้ป่วยที่รับผิดชอบ
                </h2>
              </div>
              <p className="text-sm text-text-muted">พบ {result.total} รายการผู้ป่วย{hasFilters ? "ตามการค้นหาและตัวกรอง" : "ที่รับผิดชอบ"}</p>
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
                  {hasFilters ? "ไม่พบผู้ป่วยตามการค้นหาและตัวกรอง" : "ยังไม่มีผู้ป่วยที่ได้รับมอบหมายในขอบเขตที่ใช้งานได้"}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {hasFilters
                    ? "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง"
                    : "หากรายชื่อไม่ครบ ติดต่อแอดมินโรงพยาบาล"}
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
