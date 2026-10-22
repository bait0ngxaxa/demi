import { describe, expect, it } from "vitest";

import { bloodPressureBand, bloodSugarBand } from "./vitals-bands";

describe("R2-D booklet colour bands", () => {
  it.each([
    [69, "น้อยกว่า 70", "info"],
    [70, "71 - 130", "success"],
    [130, "71 - 130", "success"],
    [131, "131 - 180", "warning"],
    [180, "131 - 180", "warning"],
    [181, "181 - 250", "orange"],
    [250, "181 - 250", "orange"],
    [251, "250 ขึ้นไป", "danger"],
  ])("classifies blood sugar %s as %s (%s)", (value, label, variant) => {
    expect(bloodSugarBand(value)).toEqual({ label, variant });
  });

  it.each([
    [119, 79, null, null],
    [120, 80, "120/80 - 129/84", "info"],
    [135, 80, "130/85 - 139/89", "success"],
    [125, 95, "140/90 - 179/109", "orange"],
    [180, 100, "180/110 ขึ้นไป", "danger"],
  ])("classifies blood pressure %s/%s by the higher band", (systolic, diastolic, label, variant) => {
    const band = bloodPressureBand(systolic, diastolic);

    expect(band?.label ?? null).toBe(label);
    expect(band?.variant ?? null).toBe(variant);
  });

  it("keeps adjacent booklet bands visually distinct", () => {
    const sugar = [60, 100, 150, 200, 300].map((value) => bloodSugarBand(value)!.variant);
    const pressure = [[120, 80], [130, 85], [140, 90], [180, 110]].map(([s, d]) => bloodPressureBand(s, d)!.variant);

    for (const variants of [sugar, pressure]) {
      variants.slice(1).forEach((variant, index) => expect(variant).not.toBe(variants[index]));
    }
  });

  it("shows no band without a value", () => {
    expect(bloodSugarBand(null)).toBeNull();
    expect(bloodPressureBand(null, null)).toBeNull();
    expect(bloodPressureBand(null, 112)?.label).toBe("180/110 ขึ้นไป");
  });
});
