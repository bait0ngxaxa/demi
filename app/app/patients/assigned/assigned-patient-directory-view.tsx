import Form from "next/form";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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
  taskMode: AssignedPatientTaskMode | null;
};

type AssignedPatientTaskMode = "screening" | "followup";

const taskPresentation: Record<AssignedPatientTaskMode, {
  title: string;
  description: string;
  selectionAction: string;
}> = {
  screening: {
    title: "คัดกรองผู้ป่วย",
    description: "เลือกผู้ป่วยที่ได้รับมอบหมาย ระบบจะแสดงแบบคัดกรองตามสิทธิ์ปัจจุบันของคุณ",
    selectionAction: "เริ่มคัดกรองผู้ป่วยรายนี้",
  },
  followup: {
    title: "บันทึกติดตาม",
    description: "เลือกผู้ป่วยที่ได้รับมอบหมาย ระบบจะตรวจสอบความสัมพันธ์และสิทธิ์ก่อนเปิดแบบบันทึก",
    selectionAction: "บันทึกติดตามผู้ป่วยรายนี้",
  },
};

function directoryUrl(input: {
  lookupType: PatientDirectoryLookupType;
  value: string;
  page: number;
  classification: PatientDirectoryClassificationFilter;
  taskMode: AssignedPatientTaskMode | null;
}): string {
  const params = new URLSearchParams({ lookupType: input.lookupType });

  if (input.taskMode) {
    params.set("task", input.taskMode);
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

function PatientRow({ item, taskMode }: {
  item: PatientAssignedDirectoryItem;
  taskMode: AssignedPatientTaskMode | null;
}): React.JSX.Element {
  const relationshipPath = `/app/patients/${encodeURIComponent(item.patientHospitalRelationshipId)}`;
  // A new follow-up round belongs to the active Program, matching the follow-up history CTA.
  const followupPath = item.activeProgramId
    ? `${relationshipPath}/programs/${encodeURIComponent(item.activeProgramId)}/followups/new`
    : `${relationshipPath}/followups/new`;
  const href = taskMode === "screening"
    ? `${relationshipPath}/screenings/new`
    : taskMode === "followup"
      ? followupPath
      : relationshipPath;

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
              {taskMode ? taskPresentation[taskMode].selectionAction : "เปิดผู้ป่วยเพื่อดูแลต่อ"}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Pagination({ result, taskMode }: {
  result: PatientAssignedDirectoryPage;
  taskMode: AssignedPatientTaskMode | null;
}): React.JSX.Element | null {
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
              classification: result.classificationFilter,
              taskMode,
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
              classification: result.classificationFilter,
              taskMode,
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
  classificationFilter,
  taskMode,
}: AssignedPatientDirectoryViewProps): React.JSX.Element {
  const lookupLabel = lookupType === "HOSPITAL_NUMBER" ? "HN" : "ชื่อผู้ป่วย";
  const maxLength =
    lookupType === "HOSPITAL_NUMBER"
      ? PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH
      : PATIENT_DIRECTORY_NAME_MAX_LENGTH;
  const hasFilters = Boolean(result?.value) || (result?.classificationFilter ?? classificationFilter) !== "ALL";

  return (
    <div className="content-workspace break-words">
      <PageHeader
        actions={<StatusBadge variant="info">ขอบเขตที่รับผิดชอบ</StatusBadge>}
        breadcrumbs={[{ href: "/app", label: "พื้นที่ทำงาน" }, { label: "ผู้ป่วยที่รับผิดชอบ" }]}
        description={taskMode
          ? taskPresentation[taskMode].description
          : "เลือกผู้ป่วยเพื่อดูโปรแกรมปัจจุบัน บันทึกการดูแล และประวัติตามสิทธิ์ของคุณ แสดงเฉพาะความสัมพันธ์ผู้ป่วยที่มอบหมายให้คุณอยู่ในขณะนี้และมีขอบเขตโรงพยาบาลที่ใช้งานได้"}
        title={taskMode ? taskPresentation[taskMode].title : "ผู้ป่วยที่รับผิดชอบ"}
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ค้นหาผู้ป่วย</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ค้นหาชื่อจากบางส่วน หรือค้นหา HN แบบตรงตัวในรายการที่ได้รับมอบหมาย
          </p>
          <Form action="/app/patients/assigned" className="mt-5 grid gap-4 @5xl/workspace:grid-cols-[13rem_minmax(0,1fr)_13rem] @5xl/workspace:items-end">
            {taskMode ? <input name="task" type="hidden" value={taskMode} /> : null}
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
                  href={taskMode ? `/app/patients/assigned?task=${taskMode}` : "/app/patients/assigned"}
                >
                  ล้างการค้นหาและตัวกรอง
                </Link>
              ) : null}
            </div>
          </Form>
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
                  {taskMode ? "เลือกผู้ป่วยที่รับผิดชอบ" : "รายชื่อผู้ป่วยที่รับผิดชอบ"}
                </h2>
                <p className="mt-1 text-sm text-text-muted">แต่ละรายการเป็นความสัมพันธ์ผู้ป่วยกับโรงพยาบาล ตรวจสอบโรงพยาบาลและ HN ก่อนเปิดดูแลต่อ</p>
              </div>
              <p className="text-sm text-text-muted">พบ {result.total} ความสัมพันธ์ผู้ป่วย{hasFilters ? "ตามการค้นหาและตัวกรอง" : "ที่รับผิดชอบ"}</p>
            </div>

            {result.items.length > 0 ? (
              <div className="mt-4 space-y-5">
                <div className="overflow-hidden rounded-panel border border-border bg-surface">
                  <ul className="divide-y divide-border" aria-label="รายชื่อผู้ป่วยที่รับผิดชอบ">
                    {result.items.map((item) => (
                      <PatientRow item={item} key={item.patientHospitalRelationshipId} taskMode={taskMode} />
                    ))}
                  </ul>
                </div>
                <Pagination result={result} taskMode={taskMode} />
              </div>
            ) : (
              <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
                <p className="font-semibold text-text">
                  {hasFilters ? "ไม่พบผู้ป่วยตามการค้นหาและตัวกรอง" : "ยังไม่มีผู้ป่วยที่ได้รับมอบหมายในขอบเขตที่ใช้งานได้"}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {hasFilters
                    ? "ลองเปลี่ยนคำค้นหา ตรวจสอบ HN แบบตรงตัว หรือล้างตัวกรองเพื่อดูผู้ป่วยที่รับผิดชอบทั้งหมด"
                    : "รายการนี้แสดงเฉพาะการมอบหมายที่ใช้งานได้ในขณะนี้ หากต้องการตรวจสอบการมอบหมาย กรุณาติดต่อเจ้าของโรงพยาบาล"}
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
