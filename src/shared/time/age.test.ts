import { describe, expect, it } from "vitest";

import { ageInFullYears } from "./age";

const dateOfBirth = new Date("1960-10-16T00:00:00.000Z");

describe("ageInFullYears (D10)", () => {
  it("completes a year on the birthday in Asia/Bangkok", () => {
    // 2026-10-15 23:59 Bangkok: the day before the birthday.
    expect(ageInFullYears(dateOfBirth, new Date("2026-10-15T16:59:00.000Z"))).toBe(65);
    // 2026-10-16 00:00 Bangkok is still 2026-10-15 in UTC.
    expect(ageInFullYears(dateOfBirth, new Date("2026-10-15T17:00:00.000Z"))).toBe(66);
    expect(ageInFullYears(dateOfBirth, new Date("2026-12-31T12:00:00.000Z"))).toBe(66);
  });

  it("handles a 29 February birthday in non-leap years", () => {
    const leapBirth = new Date("2000-02-29T00:00:00.000Z");

    expect(ageInFullYears(leapBirth, new Date("2025-02-28T05:00:00.000Z"))).toBe(24);
    expect(ageInFullYears(leapBirth, new Date("2025-03-01T05:00:00.000Z"))).toBe(25);
    expect(ageInFullYears(leapBirth, new Date("2028-02-29T05:00:00.000Z"))).toBe(28);
  });

  it("returns null for an invalid or future birth date", () => {
    expect(ageInFullYears(new Date("invalid"), new Date())).toBeNull();
    expect(ageInFullYears(new Date("2030-01-01T00:00:00.000Z"), new Date("2026-10-16T05:00:00.000Z"))).toBeNull();
  });
});
