import { describe, expect, it } from "vitest";

import { cvdRiskScoreSchema } from "./cvd-risk-score";

describe("cvdRiskScoreSchema (D7)", () => {
  it("accepts an optional percentage 0-100 with at most one decimal", () => {
    for (const value of [0, 0.1, 7.5, 12.3, 99.9, 100, null, undefined]) {
      expect(cvdRiskScoreSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects values outside 0-100, more than one decimal and non-finite numbers", () => {
    for (const value of [-0.1, 100.1, 12.34, 0.05, Number.NaN, Number.POSITIVE_INFINITY, "12.3"]) {
      expect(cvdRiskScoreSchema.safeParse(value).success).toBe(false);
    }
  });
});
