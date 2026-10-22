import { describe, expect, it } from "vitest";

import { bloodPressureBand, bloodSugarBand } from "./vitals-bands";

describe("R2-D booklet colour bands", () => {
  it.each([
    [69, "น้อยกว่า 70"],
    [70, "71 - 130"],
    [130, "71 - 130"],
    [131, "131 - 180"],
    [180, "131 - 180"],
    [181, "181 - 250"],
    [250, "181 - 250"],
    [251, "250 ขึ้นไป"],
  ])("classifies blood sugar %s as %s", (value, label) => {
    expect(bloodSugarBand(value)?.label).toBe(label);
  });

  it.each([
    [119, 79, null],
    [120, 80, "120/80 - 129/84"],
    [135, 80, "130/85 - 139/89"],
    [125, 95, "140/90 - 179/109"],
    [180, 100, "180/110 ขึ้นไป"],
  ])("classifies blood pressure %s/%s by the higher band", (systolic, diastolic, label) => {
    expect(bloodPressureBand(systolic, diastolic)?.label ?? null).toBe(label);
  });

  it("shows no band without a value", () => {
    expect(bloodSugarBand(null)).toBeNull();
    expect(bloodPressureBand(null, null)).toBeNull();
    expect(bloodPressureBand(null, 112)?.label).toBe("180/110 ขึ้นไป");
  });
});
