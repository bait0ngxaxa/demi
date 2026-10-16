import { describe, expect, it } from "vitest";

import { patientSelfMeasurementCreateSchema } from "./patient-self-measurement-schemas";

const baseInput = {
  submissionNonce: "11111111-1111-4111-8111-111111111111",
  measuredAt: "2026-10-14T05:00:00.000Z",
  weight: null,
  systolicBloodPressure: null,
  diastolicBloodPressure: null,
  bloodSugar: 95,
  note: null,
};

describe("Patient self-measurement input units", () => {
  it("requires blood sugar values to declare mg/dL", () => {
    expect(patientSelfMeasurementCreateSchema.safeParse(baseInput).success).toBe(false);
    expect(patientSelfMeasurementCreateSchema.safeParse({ ...baseInput, bloodSugarUnit: "mmol/L" }).success).toBe(false);
    expect(patientSelfMeasurementCreateSchema.safeParse({ ...baseInput, bloodSugarUnit: "mg/dL" }).success).toBe(true);
  });

  it("allows records without blood sugar to omit the unit", () => {
    expect(patientSelfMeasurementCreateSchema.safeParse({ ...baseInput, weight: 52, bloodSugar: null }).success).toBe(true);
  });
});
