import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  type AppointmentStatusValue,
} from "@/modules/appointments/domain/appointment-definitions";
import type {
  AppointmentHistory,
  AppointmentHistoryItem,
} from "@/modules/appointments/services/appointment-query-service";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function statusVariant(status: AppointmentStatusValue): StatusVariant {
  if (status === "COMPLETED") {
    return "success";
  }

  if (status === "CANCELLED") {
    return "danger";
  }

  if (status === "NO_SHOW") {
    return "neutral";
  }

  return "warning";
}

function locationSummary(item: AppointmentHistoryItem): string {
  if (!item.locationType) {
    return "ไม่ระบุสถานที่";
  }

  return APPOINTMENT_LOCATION_LABELS[item.locationType];
}

function AppointmentHistoryRow({
  item,
  relationshipId,
}: {
  item: AppointmentHistoryItem;
  relationshipId: string;
}): React.JSX.Element {
  return (
    <li>
      <Link
        className="group block px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={`/app/patients/${encodeURIComponent(relationshipId)}/appointments/${encodeURIComponent(item.appointmentId)}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text group-hover:text-brand-strong">
              {formatDate(item.scheduledAt)}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {APPOINTMENT_TYPE_LABELS[item.type]} · {locationSummary(item)}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              ผู้รับผิดชอบ: {item.responsibleDisplayName ?? "ยังไม่ระบุ"}
            </p>
          </div>
          <StatusBadge variant={statusVariant(item.status)}>
            {APPOINTMENT_STATUS_LABELS[item.status]}
          </StatusBadge>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">ระยะเวลา</dt>
            <dd className="mt-1 font-semibold text-text">
              {item.durationMinutes ? `${item.durationMinutes} นาที` : "ไม่ระบุ"}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">สถานะ</dt>
            <dd className="mt-1 font-semibold text-text">{APPOINTMENT_STATUS_LABELS[item.status]}</dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

export function AppointmentHistoryView({ history }: { history: AppointmentHistory }): React.JSX.Element {
  const relationshipId = history.patient.patientHospitalRelationshipId;

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          history.canManage ? (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/appointments/new`}
            >
              สร้างนัดหมาย
            </Link>
          ) : null
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "นัดหมาย" },
        ]}
        description="ประวัตินัดหมายของผู้ป่วยในโรงพยาบาลนี้ เรียงจากรายการล่าสุด"
        title="นัดหมาย"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
                {history.patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{history.patient.hospital.name}</p>
            </div>
            <p className="text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {history.patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
        </Panel>

        <section aria-labelledby="appointment-history-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="appointment-history-heading">
                ประวัตินัดหมาย
              </h2>
              <p className="mt-1 text-sm text-text-muted">แสดงรายการล่าสุดไม่เกิน 50 รายการ</p>
            </div>
            <p className="text-sm text-text-muted">แสดง {history.items.length} รายการ</p>
          </div>

          {history.items.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-panel border border-border bg-surface">
              <ul className="divide-y divide-border" aria-label="ประวัตินัดหมาย">
                {history.items.map((item) => (
                  <AppointmentHistoryRow item={item} key={item.appointmentId} relationshipId={relationshipId} />
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
              <p className="font-semibold text-text">ยังไม่มีนัดหมายสำหรับผู้ป่วยรายนี้</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                สร้างรายการแรกเพื่อบันทึกกำหนดการดูแลผู้ป่วย
              </p>
              {history.canManage ? (
                <Link
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  href={`/app/patients/${encodeURIComponent(relationshipId)}/appointments/new`}
                >
                  สร้างนัดหมายแรก
                </Link>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

