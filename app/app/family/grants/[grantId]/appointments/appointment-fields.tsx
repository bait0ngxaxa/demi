import { AppointmentServiceSource, appointmentServiceText } from "../../../../appointment-service-source";
import { APPOINTMENT_LOCATION_LABELS, APPOINTMENT_TYPE_LABELS, appointmentResponsiblePresentation } from "@/modules/appointments/domain/appointment-definitions";
import type { DelegatedAppointment, DelegatedAppointmentDetail } from "@/modules/family/services/delegated-appointment-query-service";

import { AppointmentListRow, AppointmentSummary, type AppointmentSummaryValues } from "../../../../appointment-summary";

/*
 * PATIENT-APPT-DISTILL: the caregiver reads the same summary as the Patient, filled only from the
 * consent-gated projection. A field the contract version does not project is absent here and is
 * simply not rendered: v1 has no extension (no location detail, responsible person or parent
 * Hospital) and only v3 carries service/source. The OSM at creation is never shown to a caregiver.
 */

function serviceText(appointment: DelegatedAppointment): string {
  return appointment.source === undefined
    ? APPOINTMENT_TYPE_LABELS[appointment.type]
    : appointmentServiceText(appointment.type, appointment.serviceCode ?? null);
}

export function familyAppointmentSummaryValues(appointment: DelegatedAppointment | DelegatedAppointmentDetail): AppointmentSummaryValues {
  const extension = appointment.extension;
  return {
    scheduledAt: appointment.scheduledAt,
    service: appointment.source === undefined
      ? APPOINTMENT_TYPE_LABELS[appointment.type]
      : <AppointmentServiceSource serviceCode={appointment.serviceCode ?? null} source={appointment.source} type={appointment.type} />,
    locationLabel: appointment.locationType === null ? null : APPOINTMENT_LOCATION_LABELS[appointment.locationType],
    locationDetail: extension?.locationDetail ?? null,
    hospitalName: appointment.hospitalName,
    parentHospitalName: extension?.parentHospitalName ?? null,
    durationMinutes: appointment.durationMinutes,
    responsible: extension?.responsibleDisplayName
      ? appointmentResponsiblePresentation(extension.responsibleDisplayName, extension.responsibleProfession)
      : null,
    contactPhones: "contactPhones" in appointment ? appointment.contactPhones : null,
  };
}

export function FamilyAppointmentSummary({ appointment }: { appointment: DelegatedAppointment | DelegatedAppointmentDetail }): React.JSX.Element {
  return <AppointmentSummary values={familyAppointmentSummaryValues(appointment)} />;
}

/** A caregiver row: no state chip, since a caregiver cannot act on the appointment. */
export function FamilyAppointmentRow({ appointment, href }: { appointment: DelegatedAppointment; href: string }): React.JSX.Element {
  return (
    <AppointmentListRow
      href={href}
      place={appointment.locationType === null ? null : APPOINTMENT_LOCATION_LABELS[appointment.locationType]}
      scheduledAt={appointment.scheduledAt}
      service={serviceText(appointment)}
      status={appointment.status}
    />
  );
}
