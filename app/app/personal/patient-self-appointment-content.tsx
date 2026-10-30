import { AppointmentServiceSource } from "../appointment-service-source";
import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  appointmentResponsiblePresentation,
  type AppointmentStatusValue,
  type AppointmentTypeValue,
  type AppointmentLocationValue,
} from "@/modules/appointments/domain/appointment-definitions";
import {
  APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS,
  APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE,
  APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE,
  APPOINTMENT_INTERACTION_SOURCE_LABELS,
} from "@/modules/appointments/domain/appointment-interaction-definitions";
import type {
  PatientSelfAppointmentDetail,
  PatientSelfAppointmentHistory,
  PatientSelfAppointmentItem,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import {
  formatPatientDateTime,
  PatientSelfEmptyState,
  PatientSelfHospitalContext,
  PatientSelfHistoryMoreLink,
  patientSelfHistoryPageHref,
} from "./patient-self-care-presentation";
import { AppointmentContactPhoneEntries } from "../appointment-contact-phones";

/*
 * Shared, mutation-free Appointment presentation. This module must not import
 * interaction controls or Server Actions: the LINE MINI scoped routes render it
 * directly, and ordinary pages compose their own controls around it.
 */

/** Finite destination adapter; callers pass fixed builders, never request URLs. */
export type PatientAppointmentLinks = {
  history: (relationshipId: string) => string;
  detail: (relationshipId: string, appointmentId: string) => string;
};

export const ORDINARY_PATIENT_APPOINTMENT_LINKS: PatientAppointmentLinks = {
  history: (relationshipId) => "/app/personal/appointments/" + encodeURIComponent(relationshipId),
  detail: (relationshipId, appointmentId) =>
    `/app/personal/appointments/${encodeURIComponent(relationshipId)}/${encodeURIComponent(appointmentId)}`,
};

export function appointmentStatusVariant(status: AppointmentStatusValue): StatusVariant {
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

function appointmentLocationLabel(type: AppointmentLocationValue | null): string {
  return type ? APPOINTMENT_LOCATION_LABELS[type] : "ไม่ระบุสถานที่";
}

/** One appointment row; `hospitalName` is shown when the list spans several Hospitals. */
export function PatientSelfAppointmentRow({
  appointment,
  href,
  hospitalName,
}: {
  appointment: PatientSelfAppointmentItem;
  href: string;
  hospitalName?: string;
}): React.JSX.Element {
  return (
    <li>
      <Link
        className="group block min-w-0 px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
        href={href}
        prefetch={false}
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="break-words font-semibold text-text group-hover:text-brand-strong">
              {formatPatientDateTime(appointment.scheduledAt)}
            </p>
            {hospitalName ? (
              <p className="mt-1 break-words text-sm font-semibold leading-6 text-text">{hospitalName}</p>
            ) : null}
            <p className="mt-1 break-words text-sm leading-6 text-text-muted">
              <AppointmentServiceSource type={appointment.type as AppointmentTypeValue} serviceCode={appointment.serviceCode} source={appointment.source} /> · {appointmentLocationLabel(appointment.locationType as AppointmentLocationValue | null)}
            </p>
            {appointment.locationDetail ? (
              <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                {appointment.locationDetail}
              </p>
            ) : null}
            <p className="mt-1 break-words text-sm leading-6 text-text-muted">
              {appointmentResponsiblePresentation(
                appointment.responsibleDisplayName,
                appointment.responsibleProfession,
              ).heading}: {appointmentResponsiblePresentation(
                appointment.responsibleDisplayName,
                appointment.responsibleProfession,
              ).displayName}
            </p>
            {appointment.osmAtCreationDisplayName ? (
              <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                OSM ที่เกี่ยวข้องเมื่อนัดถูกสร้าง: {appointment.osmAtCreationDisplayName}
              </p>
            ) : null}
          </div>
          <StatusBadge variant={appointmentStatusVariant(appointment.status as AppointmentStatusValue)}>
            {APPOINTMENT_STATUS_LABELS[appointment.status as AppointmentStatusValue]}
          </StatusBadge>
        </div>
        {appointment.durationMinutes !== null ? (
          <p className="mt-3 break-words text-sm text-text-muted">
            ระยะเวลา {appointment.durationMinutes} นาที
          </p>
        ) : null}
        {appointment.acknowledgement ? (
          <p className="mt-2 break-words text-sm text-text-muted">
            รับทราบนัดหมายแล้ว · {APPOINTMENT_INTERACTION_SOURCE_LABELS[appointment.acknowledgement.source]}
          </p>
        ) : (
          <p className="mt-2 break-words text-sm text-text-muted">ยังไม่มีการรับทราบสำหรับกำหนดการนี้</p>
        )}
        {appointment.cancellationRequests[0] ? (
          <p className="mt-2 break-words text-sm text-text-muted">
            คำขอยกเลิกล่าสุด: {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[appointment.cancellationRequests[0].status]}
          </p>
        ) : null}
        <p className="mt-3 text-sm font-semibold text-brand-strong">เปิดรายละเอียดนัดหมาย</p>
      </Link>
    </li>
  );
}

export function PatientSelfAppointmentHistoryContent({
  history,
  links,
  prefetchMore,
}: {
  history: PatientSelfAppointmentHistory;
  links: PatientAppointmentLinks;
  prefetchMore?: false;
}): React.JSX.Element {
  const relationshipId = history.relationship.relationshipId;
  const historyHref = links.history(relationshipId);

  return (
    <div className="space-y-6 pt-6">
      <PatientSelfHospitalContext relationship={history.relationship} />
      <div className="space-y-2 text-sm leading-6 text-text-muted">
        <p>{APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE}</p>
        <p>{APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE}</p>
        <p>แสดงรายการในหน้านี้ตามวันนัด เปิดรายละเอียดเพื่อดูผลล่าสุดและการดำเนินการที่มีสิทธิ์</p>
      </div>
      {history.appointments.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
          {history.appointments.map((appointment) => (
            <PatientSelfAppointmentRow
              appointment={appointment}
              href={links.detail(relationshipId, appointment.appointmentId)}
              key={appointment.appointmentId}
            />
          ))}
        </ul>
      ) : (
        <PatientSelfEmptyState title="ยังไม่มีรายการนัดหมาย" />
      )}
      {history.historyPage.hasMore ? (
        <PatientSelfHistoryMoreLink
          href={patientSelfHistoryPageHref(
            historyHref,
            { page: history.historyPage.page },
            "page",
          )}
          prefetch={prefetchMore}
        />
      ) : null}
    </div>
  );
}

/** Schedule, location, contacts and responsible people; interactions are a caller-supplied slot. */
export function PatientSelfAppointmentDetailContent({
  detail,
  rescheduleRequests,
  interactions,
}: {
  detail: PatientSelfAppointmentDetail;
  rescheduleRequests?: React.ReactNode;
  interactions: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <PatientSelfHospitalContext parentHospitalName={detail.parentHospitalName} relationship={detail.relationship} />
      <Panel>
        <h2 className="mb-5 text-lg font-semibold">กำหนดการและสถานะนัดหมาย</h2>
        <dl className="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-sm font-semibold text-text-muted">วันและเวลานัด</dt>
            <dd className="mt-1 break-words font-semibold text-text">
              {formatPatientDateTime(detail.scheduledAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm font-semibold text-text-muted">ประเภทนัดหมาย</dt>
            <dd className="mt-1 break-words font-semibold text-text">
              <AppointmentServiceSource type={detail.type as AppointmentTypeValue} serviceCode={detail.serviceCode} source={detail.source} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm font-semibold text-text-muted">สถานะนัดหมาย</dt>
            <dd className="mt-1 break-words font-semibold text-text">
              {APPOINTMENT_STATUS_LABELS[detail.status as AppointmentStatusValue]}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm font-semibold text-text-muted">ระยะเวลา</dt>
            <dd className="mt-1 break-words font-semibold text-text">
              {detail.durationMinutes === null ? "ไม่ระบุ" : `${detail.durationMinutes} นาที`}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm font-semibold text-text-muted">รูปแบบสถานที่</dt>
            <dd className="mt-1 break-words font-semibold text-text">
              {appointmentLocationLabel(detail.locationType as AppointmentLocationValue | null)}
            </dd>
          </div>
          {detail.locationDetail ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-sm font-semibold text-text-muted">รายละเอียดสถานที่</dt>
              <dd className="mt-1 break-words whitespace-pre-wrap font-semibold leading-6 text-text">
                {detail.locationDetail}
              </dd>
            </div>
          ) : null}
          <AppointmentContactPhoneEntries contactPhones={detail.contactPhones} showPatientPhone={false} />
        </dl>
        {detail.status !== "SCHEDULED" ? (
          <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-text-muted">
            เป็นประวัติผลนัด ไม่เปิดรับการรับทราบหรือคำขอยกเลิกใหม่
            {detail.status === "COMPLETED" ? " สถานะเสร็จสิ้นไม่ได้ยืนยันว่ามีบันทึกการติดตามผลหรือจบโปรแกรมแล้ว" : ""}
          </p>
        ) : null}
      </Panel>
      <Panel>
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-sm font-semibold text-text-muted">
              {appointmentResponsiblePresentation(
                detail.responsibleDisplayName,
                detail.responsibleProfession,
              ).heading}
            </dt>
            <dd className="mt-1 break-words font-semibold text-text">
              {appointmentResponsiblePresentation(
                detail.responsibleDisplayName,
                detail.responsibleProfession,
              ).displayName}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm font-semibold text-text-muted">OSM ที่เกี่ยวข้องเมื่อนัดถูกสร้าง</dt>
            <dd className="mt-1 break-words font-semibold text-text">
              {detail.osmAtCreationDisplayName ?? "ไม่มีข้อมูล OSM ณ วันที่สร้างนัด"}
            </dd>
            <dd className="mt-1 text-sm leading-6 text-text-muted">เป็นข้อมูลเมื่อสร้างนัด ไม่ยืนยันผู้รับผิดชอบปัจจุบันหรือการตอบรับงาน</dd>
          </div>
        </dl>
      </Panel>
      {rescheduleRequests}
      {interactions}
    </>
  );
}
