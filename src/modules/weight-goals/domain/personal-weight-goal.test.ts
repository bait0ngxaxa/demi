import { describe, expect, it } from "vitest";
import { isWeightGoalCivilDate, normalizeTargetWeightKg, toWeightGoalDateCarrier, fromWeightGoalDateCarrier, weightGoalBangkokToday } from "./personal-weight-goal";

describe("Personal Weight Goal domain boundaries", () => {
  it.each([
    ["0.001", "0.001"], ["1", "1"], ["72.5", "72.5"], ["72.55", "72.55"], ["72.555", "72.555"],
    ["070", "70"], ["070.5", "70.5"], ["70.50", "70.5"], ["70.500", "70.5"],
    ["000.001", "0.001"], ["1000000", "1000000"], ["1000000.000", "1000000"],
  ])("normalizes %s to %s without numeric conversion", (raw, canonical) => {
    expect(normalizeTargetWeightKg(raw)).toBe(canonical);
  });

  it.each([
    "", " ", "\t", "\n", "70\n", "70\r\n", "0", "0.000", "-1", "+1", ".5", "70.", "70.5000",
    "1000000.001", "10000000", "1e2", "1E2", "1,000", "٧٠", "７０", "Infinity", "NaN", "0x10", "70kg",
  ])("rejects non-contract value %j", (raw) => {
    expect(normalizeTargetWeightKg(raw)).toBeNull();
  });

  it("checks Gregorian date range and leap days by exact round-trip", () => {
    for (const date of ["0001-01-01", "2024-02-29", "9999-12-31"]) {
      expect(isWeightGoalCivilDate(date)).toBe(true);
      expect(fromWeightGoalDateCarrier(toWeightGoalDateCarrier(date))).toBe(date);
    }
    for (const date of ["0000-01-01", "2025-02-29", "2026-02-29", "2026-13-01", "2026-1-01", "2026-10-04\n"]) {
      expect(isWeightGoalCivilDate(date)).toBe(false);
    }
  });

  it("uses Asia/Bangkok Gregorian civil date independent of process timezone", () => {
    const beforeMidnight = new Date("2026-10-03T16:59:59.999Z");
    const midnight = new Date("2026-10-03T17:00:00.000Z");
    expect(weightGoalBangkokToday(beforeMidnight)).toBe("2026-10-03");
    expect(weightGoalBangkokToday(midnight)).toBe("2026-10-04");
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "Asia/Bangkok", "America/Los_Angeles"]) {
        process.env.TZ = zone;
        expect(fromWeightGoalDateCarrier(toWeightGoalDateCarrier("2024-02-29"))).toBe("2024-02-29");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
