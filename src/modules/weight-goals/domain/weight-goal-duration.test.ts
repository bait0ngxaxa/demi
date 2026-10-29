import { describe, expect, it } from "vitest";
import { weightGoalDateAfterWeeks } from "./personal-weight-goal";
describe("Weight goal duration uses Bangkok civil days", () => {
  it("crosses Bangkok midnight, month, leap day and year boundaries", () => {
    expect(weightGoalDateAfterWeeks(1, new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-08");
    expect(weightGoalDateAfterWeeks(1, new Date("2024-02-22T16:59:59Z"))).toBe("2024-02-29");
    expect(weightGoalDateAfterWeeks(26, new Date("2026-10-29T00:00:00Z"))).toBe("2027-04-29");
  });
  it("rejects durations outside the UI contract", () => {
    for (const weeks of [0, 27, 1.5, NaN]) expect(() => weightGoalDateAfterWeeks(weeks, new Date())).toThrow(RangeError);
  });
});
