import { describe, expect, it } from "vitest";
import { currentBuddhistYear, illnessDuration, patientHealthHistorySchema } from "./patient-health-history-schemas";
import { staffPatientHospitalProfileUpdateSchema } from "./patient-hospital-profile-schemas";

describe("Hospital health history", () => {
  const valid = { expectedVersion: 0, diabetes: "YES", hypertension: "UNKNOWN", otherConditions: null,
    familyHypertension: "NO", familyDiabetes: "YES", familyHeartDisease: "UNKNOWN", familyStroke: "UNKNOWN", diagnosisYear: 2560 };
  it("validates Buddhist years and tri-state history", () => {
    expect(patientHealthHistorySchema.safeParse(valid).success).toBe(true);
    for (const diagnosisYear of [2399, currentBuddhistYear() + 1, 2560.5]) expect(patientHealthHistorySchema.safeParse({ ...valid, diagnosisYear }).success).toBe(false);
    expect(patientHealthHistorySchema.safeParse({ ...valid, diabetes: "true" }).success).toBe(false);
    expect(patientHealthHistorySchema.safeParse({ ...valid, otherConditions: "ก".repeat(1001) }).success).toBe(false);
  });
  it("uses the current Bangkok Buddhist year, preserves unknown and zero years", () => {
    const now = new Date("2026-12-31T17:00:00Z");
    expect(currentBuddhistYear(now)).toBe(2570);
    expect(illnessDuration(2560, now)).toBe(10);
    expect(illnessDuration(2570, now)).toBe(0);
    expect(illnessDuration(null, now)).toBeNull();
    expect(illnessDuration(2571, now)).toBeNull();
  });
  it("rejects identity edits and unknown profile fields", () => {
    for (const name of ["givenName", "familyName", "personId", "gender", "hospitalId"]) {
      expect(staffPatientHospitalProfileUpdateSchema.safeParse({ expectedVersion: 0, [name]: "value" }).success).toBe(false);
    }
    expect(staffPatientHospitalProfileUpdateSchema.safeParse({ expectedVersion: 0, phoneNumber: "0812345678", postalCode: "10100" }).success).toBe(true);
    expect(staffPatientHospitalProfileUpdateSchema.safeParse({ expectedVersion: 0, postalCode: "x" }).success).toBe(false);
  });
});
