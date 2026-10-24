/**
 * Customer decision E4 (ก-20): who sees which phone number on an appointment detail.
 * - Hospital phone (HospitalContact): everyone who may read the appointment.
 * - Patient phone (hospital-local profile, else the shared Patient profile): only the currently assigned OSM
 *   and staff of the appointment's Hospital — never the Patient's own view or a caregiver grant view.
 * - WF-PHONE: current assigned OSM phone only for exact Patient SELF and same-Hospital staff.
 *   Network readers and caregivers never receive workforce phones; all other audiences fail closed.
 */
export type AppointmentContactAudience =
  | "ASSIGNED_OSM_OR_HOSPITAL_STAFF"
  | "HOSPITAL_STAFF"
  | "PATIENT_SELF"
  | "CAREGIVER_GRANT"
  | "NETWORK_READ"
  | "NONE";

export type AppointmentContactPhones = {
  assignedOsmPhone: string | null;
  hospitalPhone: string | null;
  patientPhone: string | null;
};

export function projectAppointmentContactPhones(
  source: { hospitalPhone: string | null; patientPhone: string | null; assignedOsmPhone?: string | null },
  audience: AppointmentContactAudience,
): AppointmentContactPhones {
  const noPhones: AppointmentContactPhones = {
    assignedOsmPhone: null,
    hospitalPhone: null,
    patientPhone: null,
  };

  switch (audience) {
    case "ASSIGNED_OSM_OR_HOSPITAL_STAFF":
      return {
        ...noPhones,
        hospitalPhone: source.hospitalPhone?.trim() || null,
        patientPhone: source.patientPhone?.trim() || null,
      };
    case "HOSPITAL_STAFF":
      return {
        assignedOsmPhone: source.assignedOsmPhone?.trim() || null,
        hospitalPhone: source.hospitalPhone?.trim() || null,
        patientPhone: source.patientPhone?.trim() || null,
      };
    case "PATIENT_SELF":
      return {
        ...noPhones,
        assignedOsmPhone: source.assignedOsmPhone?.trim() || null,
        hospitalPhone: source.hospitalPhone?.trim() || null,
      };
    case "CAREGIVER_GRANT":
    case "NETWORK_READ":
      return {
        ...noPhones,
        hospitalPhone: source.hospitalPhone?.trim() || null,
      };
    case "NONE":
    default:
      return noPhones;
  }
}
