import { HospitalStatus } from "@prisma/client";
import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientSelfRelationshipContext } from "@/modules/patient-self/services/patient-self-query-service";

export function formatPatientDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

export function formatPatientDateOnly(value: Date): string {
  const calendarDate = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(calendarDate);
}

export function displayPatientMeasurement(value: number | null, unit: string): string {
  return value === null || !Number.isFinite(value) ? "ไม่ระบุ" : `${value} ${unit}`;
}

export function patientSelfHistoryPageHref(
  pathname: string,
  pageParams: Record<string, number>,
  targetPageParam: string,
): string {
  const searchParams = new URLSearchParams();

  for (const [name, currentPage] of Object.entries(pageParams)) {
    const page = name === targetPageParam ? currentPage + 1 : currentPage;

    if (page > 1) {
      searchParams.set(name, String(page));
    }
  }

  const query = searchParams.toString();

  return query ? pathname + "?" + query : pathname;
}

export function PatientSelfHistoryMoreLink({
  href,
}: {
  href: string;
}): React.JSX.Element {
  return (
    <p className="mt-3">
      <Link
        className="inline-flex min-h-11 items-center rounded-control font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        href={href}
      >
        ดูรายการเก่ากว่า
      </Link>
    </p>
  );
}

export function displayPatientBloodPressure(
  systolic: number | null,
  diastolic: number | null,
): string {
  if (systolic === null && diastolic === null) {
    return "ไม่ระบุ";
  }

  return `${systolic ?? "ไม่ระบุ"} / ${diastolic ?? "ไม่ระบุ"} mmHg`;
}

export function PatientSelfHospitalContext({
  relationship,
}: {
  relationship: PatientSelfRelationshipContext;
}): React.JSX.Element {
  const hospitalStatusLabel: Record<HospitalStatus, string> = {
    [HospitalStatus.ACTIVE]: "ใช้งาน",
    [HospitalStatus.SUSPENDED]: "ถูกระงับการใช้งาน",
    [HospitalStatus.PENDING_VERIFICATION]: "รอยืนยันการขึ้นทะเบียน",
  };

  return (
    <Panel>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold text-text">
            {relationship.hospitalName}
          </h2>
          <dl className="mt-3 grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-text-muted">รหัสโรงพยาบาล</dt>
              <dd className="mt-0.5 break-words font-medium text-text">
                {relationship.hospitalCode}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-text-muted">HN</dt>
              <dd className="mt-0.5 break-words font-medium text-text">
                {relationship.hospitalNumber ?? "ยังไม่ได้บันทึก"}
              </dd>
            </div>
          </dl>
        </div>
        <StatusBadge variant="neutral">
          สถานะโรงพยาบาล: {hospitalStatusLabel[relationship.hospitalStatus]}
        </StatusBadge>
      </div>
    </Panel>
  );
}

export function PatientSelfEmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-6 sm:px-7">
      <p className="font-semibold text-text">{title}</p>
      {children ? <div className="mt-2 text-sm leading-6 text-text-muted">{children}</div> : null}
    </div>
  );
}

export const patientProgramStatusLabels = {
  ACTIVE: "กำลังดำเนินการ",
  COMPLETED: "สิ้นสุดแล้ว",
} as const;
