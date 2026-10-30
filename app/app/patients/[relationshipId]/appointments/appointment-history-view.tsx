import { AppointmentServiceSource, OneOffVisitNote } from "../../../appointment-service-source";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  appointmentResponsiblePresentation,
  type AppointmentStatusValue,
} from "@/modules/appointments/domain/appointment-definitions";
import {
  APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS,
  APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE,
  APPOINTMENT_INTERACTION_SOURCE_LABELS,
} from "@/modules/appointments/domain/appointment-interaction-definitions";
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
        prefetch={false}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="text-base font-semibold text-text group-hover:text-brand-strong">
              {formatDate(item.scheduledAt)}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              <AppointmentServiceSource type={item.type} serviceCode={item.serviceCode} source={item.source} /> · {locationSummary(item)}
            </p>
            <p className="mt-1 break-words text-sm leading-6 text-text-muted">
              {appointmentResponsiblePresentation(
                item.responsibleDisplayName,
                item.responsibleProfession,
              ).heading}: {appointmentResponsiblePresentation(
                item.responsibleDisplayName,
                item.responsibleProfession,
              ).displayName}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              OSM ณ เวลาสร้างนัด: {item.osmAtCreationDisplayName ?? "ไม่มีข้อมูล OSM ณ วันที่สร้างนัด"}
            </p>
            <OneOffVisitNote visible={item.isOneOffVisit} />
            {item.currentAcknowledgement ? (
              <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                รับทราบนัดหมายแล้วโดย {item.currentAcknowledgement.recordedByDisplayName ?? APPOINTMENT_INTERACTION_SOURCE_LABELS[item.currentAcknowledgement.source]}
              </p>
            ) : (
              <p className="mt-1 text-sm leading-6 text-text-muted">ยังไม่มีการรับทราบสำหรับกำหนดการนี้</p>
            )}
            {item.cancellationRequests[0] ? (
              <p className="mt-1 text-sm leading-6 text-text-muted">
                คำขอยกเลิกล่าสุด: {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[item.cancellationRequests[0].status]}
              </p>
            ) : null}
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
            <dt className="text-text-muted">รายละเอียดและการดำเนินการที่มีสิทธิ์</dt>
            <dd className="mt-1 font-semibold text-brand-strong">เปิดรายละเอียดนัดหมาย</dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

export function AppointmentHistoryView({ history }: { history: AppointmentHistory }): React.JSX.Element {
  const relationshipId = history.patient.patientHospitalRelationshipId;
  const scheduled = history.items.filter((item) => item.status === "SCHEDULED");
  const historical = history.items.filter((item) => item.status !== "SCHEDULED");

  return (
    <div>
      <PageHeader
        actions={
          history.canCreate ? (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(relationshipId)}/appointments/new`}
              prefetch={false}
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
        description="นัดหมายของผู้ป่วยในโรงพยาบาลนี้ แยกกำหนดการที่ยังนัดหมายอยู่กับประวัติผลนัด"
        title="นัดหมาย"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-semibold tracking-[-0.03em] text-text">
                {history.patient.displayName}
              </h2>
              <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                {history.patient.hospital.name}
              </p>
            </div>
            <p className="break-words text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {history.patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
        </Panel>

        <section aria-labelledby="appointment-history-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="appointment-history-heading">
                รายการนัดหมายล่าสุด
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">ใช้วันนัดล่าสุดไม่เกิน 50 รายการในการแบ่งกลุ่มนี้ ไม่ใช่ประวัติทั้งหมด</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">{APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE}</p>
            </div>
          </div>

          {history.items.length > 0 ? (
            <div className="mt-6 space-y-6">
              <section aria-labelledby="scheduled-appointments-heading">
                <h3 className="text-lg font-semibold" id="scheduled-appointments-heading">ยังอยู่ในกำหนดนัด</h3>
                {scheduled.length > 0 ? (
                  <ul className="mt-3 divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface" aria-label="ยังอยู่ในกำหนดนัด">
                    {scheduled.map((item) => (
                      <AppointmentHistoryRow item={item} key={item.appointmentId} relationshipId={relationshipId} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">ไม่มีสถานะนัดหมายแล้วใน 50 รายการล่าสุดที่แสดง</p>
                )}
              </section>
              <details open={scheduled.length === 0} className="rounded-panel border border-border bg-surface">
                <summary className="min-h-11 cursor-pointer rounded-panel px-5 py-4 font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring sm:px-7">ประวัติผลนัด: เสร็จสิ้น ยกเลิก หรือไม่มาตามนัด</summary>
                {historical.length > 0 ? (
                  <ul className="divide-y divide-border border-t border-border" aria-label="ประวัติผลนัด">
                    {historical.map((item) => (
                      <AppointmentHistoryRow item={item} key={item.appointmentId} relationshipId={relationshipId} />
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 pb-5 text-sm text-text-muted sm:px-7">ไม่มีประวัติผลนัดในรายการล่าสุดที่แสดง</p>
                )}
              </details>
            </div>
          ) : (
            <div className="mt-4 rounded-panel border border-dashed border-border bg-surface px-5 py-8 text-center sm:px-7">
              <p className="font-semibold text-text">ยังไม่มีนัดหมายสำหรับผู้ป่วยรายนี้</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {history.canCreate ? "ใช้ปุ่มสร้างนัดหมายด้านบนเพื่อบันทึกกำหนดการใหม่" : "เมื่อมีรายการนัดหมายที่บัญชีนี้อ่านได้ ข้อมูลจะแสดงที่นี่"}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

