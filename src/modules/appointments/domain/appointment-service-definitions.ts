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
  sourceServiceRequestId: string | null;
};

/**
 * ADR-0023 (SR-D2): an appointment booked from a service request for an อสม. other than the patient's current
 * assignment is a one-off visit; the assignment itself never changes.
 */
export function isOneOffVisitOsm({
  appointmentOsmUserId,
  assignedOsmUserId,
  sourceServiceRequestId,
}: OneOffVisitOsmInput): boolean {
  return (
    appointmentOsmUserId !== null &&
    sourceServiceRequestId !== null &&
    appointmentOsmUserId !== assignedOsmUserId
  );
}
