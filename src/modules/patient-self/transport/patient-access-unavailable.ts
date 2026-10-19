/**
 * Server decision for a Patient entry route (Rich Menu destination) whose
 * SELF read was denied: the signed-in account has no usable Patient access.
 * It carries no identity, role or relationship detail; pages only render it.
 */
export const PATIENT_ACCESS_UNAVAILABLE = { status: "PATIENT_ACCESS_UNAVAILABLE" } as const;

export type PatientAccessUnavailable = typeof PATIENT_ACCESS_UNAVAILABLE;

export function isPatientAccessUnavailable(value: unknown): value is PatientAccessUnavailable {
  return value === PATIENT_ACCESS_UNAVAILABLE;
}
