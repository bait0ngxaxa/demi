import { describe, expect, it } from "vitest";

import { patientSelfMeasurementCreateSchema } from "../schemas/patient-self-measurement-schemas";
import {
  canDeletePatientSelfMeasurement,
  isAcceptablePatientSelfMeasurementTime,
} from "./patient-self-measurement";

const now = new Date("2026-10-16T05:00:00.000Z");
const hours = (value: number): number => value * 3_600_000;

describe("E5 patient self-measurement rules", () => {
  it("allows deletion only within 24 hours of recording", () => {
    expect(canDeletePatientSelfMeasurement(new Date(now.getTime() - hours(23.9)), now)).toBe(true);
    expect(canDeletePatientSelfMeasurement(new Date(now.getTime() - hours(24)), now)).toBe(false);
    expect(canDeletePatientSelfMeasurement(new Date(now.getTime() + hours(1)), now)).toBe(false);
  });

  it("accepts a measurement time from the past year up to a small clock skew", () => {
    expect(isAcceptablePatientSelfMeasurementTime(new Date(now.getTime() + 60_000), now)).toBe(true);
    expect(isAcceptablePatientSelfMeasurementTime(new Date(now.getTime() + hours(1)), now)).toBe(false);
    expect(isAcceptablePatientSelfMeasurementTime(new Date(now.getTime() - hours(24 * 367)), now)).toBe(false);
  });

  it("requires at least one value within the PatientFollowup range", () => {
    const base = { submissionNonce: "11111111-1111-4111-8111-111111111111", measuredAt: "2026-10-16T10:00:00+07:00", weight: null, systolicBloodPressure: null, diastolicBloodPressure: null, bloodSugar: null, note: "" };
    expect(patientSelfMeasurementCreateSchema.safeParse(base).success).toBe(false);
    expect(patientSelfMeasurementCreateSchema.safeParse({ ...base, bloodSugar: 110, bloodSugarUnit: "mg/dL" }).success).toBe(true);
    expect(patientSelfMeasurementCreateSchema.safeParse({ ...base, weight: -1 }).success).toBe(false);
    expect(patientSelfMeasurementCreateSchema.safeParse({ ...base, weight: 1_000_001 }).success).toBe(false);
    expect(patientSelfMeasurementCreateSchema.safeParse({ ...base, weight: 60, roundNumber: 1 }).success).toBe(false);
  });
});
