import { APPOINTMENT_LOCATION_LABELS, APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS, appointmentResponsiblePresentation } from "@/modules/appointments/domain/appointment-definitions";
import type { DelegatedAppointment, DelegatedAppointmentDetail } from "@/modules/family/services/delegated-appointment-query-service";
import { StatusBadge } from "@/components/ui/status-badge";
import { AppointmentContactPhoneEntries } from "../../../../appointment-contact-phones";

export function AppointmentFields({ appointment }: { appointment: DelegatedAppointment | DelegatedAppointmentDetail }): React.JSX.Element {
  const extension = appointment.extension;
  // AF-5 v2 adds the parent Hospital, location detail, the appointer and the OSM at creation; v1 shows none of them.
  const responsible = extension ? appointmentResponsiblePresentation(extension.responsibleDisplayName, extension.responsibleProfession) : null;
  const fields = [
    ["หน่วยบริการ", extension?.parentHospitalName ? `${appointment.hospitalName} · ${extension.parentHospitalName}` : appointment.hospitalName],
    ["ประเภทนัด", APPOINTMENT_TYPE_LABELS[appointment.type]],
    ["วันและเวลา", new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(appointment.scheduledAt)],
    ["ระยะเวลา", appointment.durationMinutes === null ? "ยังไม่ระบุ" : `${appointment.durationMinutes} นาที`],
    ["รูปแบบสถานที่", appointment.locationType === null ? "ยังไม่ระบุ" : APPOINTMENT_LOCATION_LABELS[appointment.locationType]],
    ...(extension ? [
      ["รายละเอียดสถานที่", extension.locationDetail ?? "ยังไม่ระบุ"],
      [responsible?.heading ?? "ผู้รับผิดชอบนัด", responsible?.displayName ?? "ยังไม่ระบุ"],
      ["อสม. ที่ดูแลขณะสร้างนัด", extension.osmAtCreationDisplayName ?? "ไม่มีข้อมูล"],
    ] : []),
  ];
  return <dl className="grid gap-4 sm:grid-cols-2">
    {fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-text-muted">{label}</dt><dd className="mt-1 break-words font-semibold text-text">{value}</dd></div>)}
    <div><dt className="text-sm text-text-muted">สถานะนัด</dt><dd className="mt-1"><StatusBadge variant={appointment.status === "CANCELLED" ? "neutral" : "info"}>{APPOINTMENT_STATUS_LABELS[appointment.status]}</StatusBadge></dd></div>
    {"contactPhones" in appointment ? <AppointmentContactPhoneEntries contactPhones={appointment.contactPhones} showPatientPhone={false} /> : null}
  </dl>;
}
