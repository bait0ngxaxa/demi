import { StatusBadge } from "@/components/ui/status-badge";
import { APPOINTMENT_TYPE_LABELS, type AppointmentTypeValue } from "@/modules/appointments/domain/appointment-definitions";
import type { AppointmentSource } from "@/modules/appointments/domain/appointment-service-definitions";
import { PATIENT_SERVICE_LABELS } from "@/modules/patient-service-requests/domain/patient-service-definitions";
import type { PatientServiceCode } from "@prisma/client";

export function AppointmentServiceSource({ type, serviceCode, source }: {
  type: AppointmentTypeValue;
  serviceCode: PatientServiceCode | null;
  source: AppointmentSource;
}): React.JSX.Element {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2 align-middle">
      <span className="min-w-0 break-words">{APPOINTMENT_TYPE_LABELS[type]}{serviceCode ? ` · ${PATIENT_SERVICE_LABELS[serviceCode]}` : ""}</span>
      <StatusBadge variant="neutral">{source === "PATIENT_REQUEST" ? "ขอรับบริการ" : "โรงพยาบาลนัด"}</StatusBadge>
    </span>
  );
}

export function OneOffVisitNote({ visible }: { visible: boolean }): React.JSX.Element | null {
  return visible ? <p className="mt-2 break-words text-sm leading-6 text-text-muted">เยี่ยมครั้งนี้เท่านั้น (ไม่ใช่ อสม. ผู้ดูแล)</p> : null;
}
