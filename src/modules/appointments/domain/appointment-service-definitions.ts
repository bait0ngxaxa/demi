import type { AppointmentType, PatientServiceCode } from "@prisma/client";

/** ADR-0023 (SR-D4): the appointment type follows the requested service. */
export const SERVICE_APPOINTMENT_TYPE: Record<PatientServiceCode, AppointmentType> = {
  SCREENING: "ASSESSMENT",
  FOLLOW_UP: "FOLLOW_UP",
  EMPOWERMENT: "EDUCATION",
};

export type AppointmentSource = "HOSPITAL" | "PATIENT_REQUEST";

export function appointmentSource(sourceServiceRequestId: string | null): AppointmentSource {
  return sourceServiceRequestId == null ? "HOSPITAL" : "PATIENT_REQUEST";
}

export type OneOffVisitOsmInput = {
  appointmentOsmUserId: string | null;
  assignedOsmUserId: string | null;
};

/**
 * ADR-0023 (SR-D2), generalized by ADR-0027 (AP-2): an appointment whose อสม. is not the patient's current
 * assignment is a one-off visit, whether it was booked from a service request or by the Hospital. The
 * assignment itself never changes.
 */
export function isOneOffVisitOsm({ appointmentOsmUserId, assignedOsmUserId }: OneOffVisitOsmInput): boolean {
  return appointmentOsmUserId !== null && appointmentOsmUserId !== assignedOsmUserId;
}
