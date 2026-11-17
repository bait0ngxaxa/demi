import { describe, expect, it } from "vitest";

import {
  BLOOD_PRESSURE_ORDER_MESSAGE,
  CLINICAL_VALUE_LIMITS,
  clinicalMeasurementSchema,
  clinicalValueRangeMessage,
  isBloodPressureOrderValid,
  isClinicalValueInRange,
  type ClinicalMeasurementKind,
} from "./clinical-value-limits";

const kinds = Object.keys(CLINICAL_VALUE_LIMITS) as ClinicalMeasurementKind[];
const JUST_OUTSIDE = 0.01;

describe("clinical value limits (N3)", () => {
  it("defines the engineering-default hard limits per measurement kind", () => {
    expect(CLINICAL_VALUE_LIMITS).toEqual({
      weight: expect.objectContaining({ unit: "kg", min: 1, max: 500 }),
      height: expect.objectContaining({ unit: "cm", min: 30, max: 250 }),
      waistCircumference: expect.objectContaining({ unit: "cm", min: 20, max: 300 }),
      systolicBloodPressure: expect.objectContaining({ unit: "mmHg", min: 40, max: 300 }),
      diastolicBloodPressure: expect.objectContaining({ unit: "mmHg", min: 20, max: 200 }),
      bloodSugar: expect.objectContaining({ unit: "mg/dL", min: 10, max: 1_000 }),
      hba1c: expect.objectContaining({ unit: "%", min: 2, max: 20 }),
    });
  });

  it.each(kinds)("accepts both edges of %s and rejects just outside them", (kind) => {
    const { min, max } = CLINICAL_VALUE_LIMITS[kind];
    const schema = clinicalMeasurementSchema(kind);

    for (const value of [min, max]) {
      expect(isClinicalValueInRange(kind, value)).toBe(true);
      expect(schema.safeParse(value).success).toBe(true);
    }

    for (const value of [min - JUST_OUTSIDE, max + JUST_OUTSIDE]) {
      expect(isClinicalValueInRange(kind, value)).toBe(false);
      const parsed = schema.safeParse(value);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(clinicalValueRangeMessage(kind));
    }
  });

  it.each(kinds)("rejects zero, negative and non-finite %s values", (kind) => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isClinicalValueInRange(kind, value)).toBe(false);
      expect(clinicalMeasurementSchema(kind).safeParse(value).success).toBe(false);
    }
  });

  it("names the field, its limits and the unit in Thai", () => {
    expect(clinicalValueRangeMessage("weight")).toBe("น้ำหนักต้องอยู่ระหว่าง 1–500 กก.");
    expect(clinicalValueRangeMessage("height")).toBe("ส่วนสูงต้องอยู่ระหว่าง 30–250 ซม.");
    expect(clinicalValueRangeMessage("systolicBloodPressure")).toBe("ความดันตัวบนต้องอยู่ระหว่าง 40–300 มม.ปรอท");
    expect(clinicalValueRangeMessage("bloodSugar")).toBe("น้ำตาลในเลือดต้องอยู่ระหว่าง 10–1000 มก./ดล.");
    expect(clinicalValueRangeMessage("hba1c")).toBe("HbA1c ต้องอยู่ระหว่าง 2–20%");
  });

  it("requires systolic above diastolic only when both are present", () => {
    expect(isBloodPressureOrderValid(120, 80)).toBe(true);
    expect(isBloodPressureOrderValid(80, 80)).toBe(false);
    expect(isBloodPressureOrderValid(70, 80)).toBe(false);
    expect(isBloodPressureOrderValid(120, null)).toBe(true);
    expect(isBloodPressureOrderValid(undefined, 80)).toBe(true);
    expect(BLOOD_PRESSURE_ORDER_MESSAGE).toBe("ความดันตัวบนต้องมากกว่าความดันตัวล่าง");
  });
});
