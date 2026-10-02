import { APPOINTMENT_LOCATION_LABELS, APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS } from "@/modules/appointments/domain/appointment-definitions";
import type { DelegatedAppointment } from "@/modules/family/services/delegated-appointment-query-service";
import { StatusBadge } from "@/components/ui/status-badge";

export function AppointmentFields({ appointment }: { appointment: DelegatedAppointment }): React.JSX.Element {
  const fields = [
    ["หน่วยบริการ", appointment.hospitalName],
    ["ประเภทนัด", APPOINTMENT_TYPE_LABELS[appointment.type]],
    ["วันและเวลา", new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(appointment.scheduledAt)],
    ["ระยะเวลา", appointment.durationMinutes === null ? "ยังไม่ระบุ" : `${appointment.durationMinutes} นาที`],
    ["รูปแบบสถานที่", appointment.locationType === null ? "ยังไม่ระบุ" : APPOINTMENT_LOCATION_LABELS[appointment.locationType]],
  ];
  return <dl className="grid gap-4 sm:grid-cols-2">
    {fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-text-muted">{label}</dt><dd className="mt-1 break-words font-semibold text-text">{value}</dd></div>)}
    <div><dt className="text-sm text-text-muted">สถานะนัด</dt><dd className="mt-1"><StatusBadge variant={appointment.status === "CANCELLED" ? "neutral" : "info"}>{APPOINTMENT_STATUS_LABELS[appointment.status]}</StatusBadge></dd></div>
  </dl>;
}
