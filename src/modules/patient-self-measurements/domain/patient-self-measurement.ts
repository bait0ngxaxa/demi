/**
 * Customer decision E5 (ก-22): "ตัวฉันในตอนนี้" — weight, blood sugar and blood pressure the Patient records.
 * Always shown as Patient-reported, kept apart from OSM/staff records; never a service round, never round vitals
 * and never a report source.
 */
export const PATIENT_SELF_MEASUREMENT_LABEL = "ผู้ป่วยบันทึกเอง";
export const PATIENT_SELF_MEASUREMENT_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PATIENT_SELF_MEASUREMENT_MAX_AGE_MS = 366 * 24 * 60 * 60 * 1000;
export const PATIENT_SELF_MEASUREMENT_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const PATIENT_SELF_MEASUREMENT_OWN_LIST_LIMIT = 50;
export const PATIENT_SELF_MEASUREMENT_CARE_TEAM_LIST_LIMIT = 20;

export type PatientSelfMeasurementDto = {
  measurementId: string;
  measuredAt: Date;
  weight: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
  note: string | null;
  createdAt: Date;
};

export function canDeletePatientSelfMeasurement(createdAt: Date, now: Date): boolean {
  const age = now.getTime() - createdAt.getTime();
  return age >= 0 && age < PATIENT_SELF_MEASUREMENT_DELETE_WINDOW_MS;
}

export function isAcceptablePatientSelfMeasurementTime(measuredAt: Date, now: Date): boolean {
  const offset = now.getTime() - measuredAt.getTime();
  return offset >= -PATIENT_SELF_MEASUREMENT_FUTURE_SKEW_MS && offset <= PATIENT_SELF_MEASUREMENT_MAX_AGE_MS;
}
