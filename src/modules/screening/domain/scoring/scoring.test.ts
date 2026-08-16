import { describe, expect, it } from "vitest";

import { calculateLegacyPrototypeResult } from "./legacy-prototype-v1";

function scoreInput(pam: readonly number[], proms: readonly number[]) {
  return {
    pam: Object.fromEntries(pam.map((value, index) => [`pam-${index + 1}`, value])),
    proms: Object.fromEntries(proms.map((value, index) => [`proms-${index + 1}`, value])),
  };
}

describe("legacy-prototype-v1 Screening scoring", () => {
  it.each([
    ["PAM total <= 5", [1, 1, 1, 1, 1], [6, 6, 6, 6]],
    ["PROMs minimum <= 2", [2, 2, 2, 2, 2], [2, 6, 6, 6]],
    ["PROMs total <= 8", [2, 2, 2, 2, 2], [1, 1, 3, 3]],
  ] as const)("maps %s to L1 RED", (_label, pam, proms) => {
    expect(calculateLegacyPrototypeResult(scoreInput(pam, proms))).toMatchObject({
      level: "L1",
      zone: "RED",
    });
  });

  it("maps a combined total below 50% to L2 GREEN", () => {
    expect(calculateLegacyPrototypeResult(scoreInput([1, 2, 2, 2, 2], [3, 3, 3, 3]))).toMatchObject({
      combinedTotal: 21,
      percentage: (21 / 44) * 100,
      level: "L2",
      zone: "GREEN",
    });
  });

  it("maps exactly 50% to L3 YELLOW", () => {
    expect(calculateLegacyPrototypeResult(scoreInput([2, 2, 2, 2, 2], [3, 3, 3, 3]))).toMatchObject({
      combinedTotal: 22,
      percentage: 50,
      level: "L3",
      zone: "YELLOW",
    });
  });

  it("maps a combined total below 75% to L3 YELLOW", () => {
    expect(calculateLegacyPrototypeResult(scoreInput([2, 2, 2, 2, 2], [5, 5, 6, 6]))).toMatchObject({
      combinedTotal: 32,
      percentage: (32 / 44) * 100,
      level: "L3",
      zone: "YELLOW",
    });
  });

  it.each([
    ["exactly 75%", [2, 2, 2, 2, 2], [5, 6, 6, 6]],
    ["above 75%", [2, 2, 2, 2, 2], [6, 6, 6, 6]],
  ] as const)("maps %s to L4 GREEN", (_label, pam, proms) => {
    expect(calculateLegacyPrototypeResult(scoreInput(pam, proms))).toMatchObject({
      level: "L4",
      zone: "GREEN",
    });
  });
});
