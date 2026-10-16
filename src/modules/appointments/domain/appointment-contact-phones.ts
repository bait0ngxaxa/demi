/**
 * Customer decision E4 (ก-20): who sees which phone number on an appointment detail.
 * - Hospital phone (HospitalContact): everyone who may read the appointment.
 * - Patient phone (hospital-local profile, else the shared Patient profile): only the currently assigned OSM
 *   and staff of the appointment's Hospital — never the Patient's own view or a caregiver grant view.
 */
export type AppointmentContactAudience = "ASSIGNED_OSM_OR_HOSPITAL_STAFF" | "PATIENT_SELF" | "CAREGIVER_GRANT";

export type AppointmentContactPhones = {
  hospitalPhone: string | null;
  patientPhone: string | null;
};

export function projectAppointmentContactPhones(
  source: { hospitalPhone: string | null; patientPhone: string | null },
  audience: AppointmentContactAudience,
): AppointmentContactPhones {
  return {
    hospitalPhone: source.hospitalPhone?.trim() || null,
    patientPhone: audience === "ASSIGNED_OSM_OR_HOSPITAL_STAFF" ? source.patientPhone?.trim() || null : null,
  };
}
