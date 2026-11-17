import { describe, expect, it } from "vitest";

import {
  BLOOD_PRESSURE_ORDER_MESSAGE,
  CLINICAL_VALUE_LIMITS,
  clinicalValueRangeMessage,
  type ClinicalMeasurementKind,
} from "@/shared/clinical/clinical-value-limits";

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

describe("Patient self-measurement clinical value limits (N3)", () => {
  const withUnit = { ...baseInput, bloodSugarUnit: "mg/dL" };
  const fields = [
    ["weight", "weight"],
    ["systolicBloodPressure", "systolicBloodPressure"],
    ["diastolicBloodPressure", "diastolicBloodPressure"],
    ["bloodSugar", "bloodSugar"],
  ] as const satisfies readonly (readonly [string, ClinicalMeasurementKind])[];

  it.each(fields)("accepts %s inside its limits and rejects it outside, naming the field", (field, kind) => {
    const { min, max } = CLINICAL_VALUE_LIMITS[kind];

    expect(patientSelfMeasurementCreateSchema.safeParse({ ...withUnit, [field]: min }).success).toBe(true);

    const parsed = patientSelfMeasurementCreateSchema.safeParse({ ...withUnit, [field]: max + 1 });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toContainEqual(
      expect.objectContaining({ path: [field], message: clinicalValueRangeMessage(kind) }),
    );
  });

  it.each(fields)("rejects 0 for %s", (field, kind) => {
    const parsed = patientSelfMeasurementCreateSchema.safeParse({ ...withUnit, [field]: 0 });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toContainEqual(
      expect.objectContaining({ path: [field], message: clinicalValueRangeMessage(kind) }),
    );
  });

  it("requires systolic above diastolic when both are recorded", () => {
    const parsed = patientSelfMeasurementCreateSchema.safeParse({
      ...withUnit,
      systolicBloodPressure: 85,
      diastolicBloodPressure: 85,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toContainEqual(
      expect.objectContaining({ path: ["systolicBloodPressure"], message: BLOOD_PRESSURE_ORDER_MESSAGE }),
    );
    expect(
      patientSelfMeasurementCreateSchema.safeParse({ ...withUnit, systolicBloodPressure: 120, diastolicBloodPressure: 80 })
        .success,
    ).toBe(true);
  });
});
