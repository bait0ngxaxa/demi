/**
 * Customer decision E4 (ก-20): who sees which phone number on an appointment detail.
 * - Hospital phone (HospitalContact): everyone who may read the appointment.
 * - Patient phone (hospital-local profile, else the shared Patient profile): only the currently assigned OSM
 *   and staff of the appointment's Hospital — never the Patient's own view or a caregiver grant view.
 * - WF-PHONE: current assigned OSM phone only for exact Patient SELF and same-Hospital staff.
 *   Staff phones and every workforce phone for caregivers are excluded.
 */
export type AppointmentContactAudience = "ASSIGNED_OSM_OR_HOSPITAL_STAFF" | "HOSPITAL_STAFF" | "PATIENT_SELF" | "CAREGIVER_GRANT";

export type AppointmentContactPhones = {
  assignedOsmPhone: string | null;
  hospitalPhone: string | null;
  patientPhone: string | null;
};

export function projectAppointmentContactPhones(
  source: { hospitalPhone: string | null; patientPhone: string | null; assignedOsmPhone?: string | null },
  audience: AppointmentContactAudience,
): AppointmentContactPhones {
  return {
    assignedOsmPhone: audience === "PATIENT_SELF" || audience === "HOSPITAL_STAFF" ? source.assignedOsmPhone?.trim() || null : null,
    hospitalPhone: source.hospitalPhone?.trim() || null,
    patientPhone: (audience === "ASSIGNED_OSM_OR_HOSPITAL_STAFF" || audience === "HOSPITAL_STAFF") ? source.patientPhone?.trim() || null : null,
  };
}
