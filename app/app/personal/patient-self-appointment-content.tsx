import { AppointmentServiceSource, appointmentServiceText } from "../appointment-service-source";
import { appointmentAssigneePresentation } from "@/modules/appointments/domain/appointment-people";

import {
  APPOINTMENT_LOCATION_LABELS,
  type AppointmentStatusValue,
  type AppointmentTypeValue,
  type AppointmentLocationValue,
} from "@/modules/appointments/domain/appointment-definitions";
import type {
  PatientSelfAppointmentDetail,
  PatientSelfAppointmentHistory,
  PatientSelfAppointmentItem,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import {
  AppointmentListRow,
  AppointmentSummary,
  type AppointmentRowChip,
} from "../appointment-summary";
import {
  PatientSelfEmptyState,
  PatientSelfHospitalContext,
  PatientSelfHistoryMoreLink,
  patientSelfHistoryPageHref,
} from "./patient-self-care-presentation";

export { appointmentStatusVariant } from "../appointment-summary";

/*
 * Shared, mutation-free Appointment presentation. This module must not import
 * interaction controls or Server Actions: ordinary pages compose their own
 * controls around it.
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

function appointmentLocationLabel(type: AppointmentLocationValue | null): string | null {
  return type ? APPOINTMENT_LOCATION_LABELS[type] : null;
}

/**
 * PATIENT-APPT-DISTILL: one state chip for a SCHEDULED row, highest priority first. "รอคุณรับทราบ"
 * is the only warning: it is the one state that asks the Patient to act.
 */
export function patientAppointmentRowChip(
  appointment: Pick<PatientSelfAppointmentItem, "status" | "cancellationRequests" | "pendingReschedule" | "acknowledgement">,
): AppointmentRowChip | null {
  if (appointment.status !== "SCHEDULED") return null;
  if (appointment.cancellationRequests.some((request) => request.status === "PENDING")) {
    return { label: "ขอยกเลิก รอพิจารณา", variant: "neutral" };
  }
  if (appointment.pendingReschedule) return { label: "ขอเลื่อน รอพิจารณา", variant: "neutral" };
  if (!appointment.acknowledgement) return { label: "รอคุณรับทราบ", variant: "warning" };
  return { label: "รับทราบแล้ว", variant: "neutral" };
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
    <AppointmentListRow
      chip={patientAppointmentRowChip(appointment)}
      hospitalName={hospitalName}
      href={href}
      place={appointmentLocationLabel(appointment.locationType as AppointmentLocationValue | null)}
      scheduledAt={appointment.scheduledAt}
      service={appointmentServiceText(appointment.type as AppointmentTypeValue, appointment.serviceCode)}
      status={appointment.status as AppointmentStatusValue}
    />
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

/** What, when and where: the shared read-only summary filled from the Patient's own projection. */
export function PatientSelfAppointmentDetailContent({
  detail,
  notice,
}: {
  detail: PatientSelfAppointmentDetail;
  notice?: React.ReactNode;
}): React.JSX.Element {
  const assignee = appointmentAssigneePresentation(detail);
  const hasAssignee = detail.assignedOsmDisplayName !== null || detail.responsibleDisplayName !== null;

  return (
    <AppointmentSummary
      notice={notice}
      values={{
        scheduledAt: detail.scheduledAt,
        service: (
          <AppointmentServiceSource
            serviceCode={detail.serviceCode}
            source={detail.source}
            type={detail.type as AppointmentTypeValue}
          />
        ),
        locationLabel: appointmentLocationLabel(detail.locationType as AppointmentLocationValue | null),
        locationDetail: detail.locationDetail,
        hospitalName: detail.relationship.hospitalName,
        parentHospitalName: detail.parentHospitalName,
        durationMinutes: detail.durationMinutes,
        responsible: hasAssignee ? assignee : null,
        contactPhones: detail.contactPhones,
      }}
    />
  );
}
