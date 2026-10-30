import { describe, expect, it } from "vitest";

import {
  PATIENT_SERVICE_LABELS,
  PATIENT_SERVICE_REQUEST_SLOT_LABELS,
  isValidPreferredDate,
} from "./patient-service-definitions";

describe("Patient service definitions (ADR-0023)", () => {
  it("labels the three services and the preferred slots in Thai", () => {
    expect(PATIENT_SERVICE_LABELS).toEqual({
      SCREENING: "คัดกรอง",
      FOLLOW_UP: "ติดตาม",
      EMPOWERMENT: "เสริมพลังใจ",
    });
    expect(PATIENT_SERVICE_REQUEST_SLOT_LABELS).toEqual({
      MORNING: "เช้า",
      AFTERNOON: "บ่าย",
      ANY: "ตามสะดวก",
    });
  });

  describe("isValidPreferredDate", () => {
    // 10:00 on 2026-10-30 in Asia/Bangkok.
    const now = new Date("2026-10-30T03:00:00.000Z");

    it.each([
      ["2026-10-29", false],
      ["2026-10-30", false],
      ["2026-10-31", true],
      ["2026-12-29", true],
      ["2026-12-30", false],
    ])("accepts %s: %s (tomorrow to today + 60 days)", (preferredDate, expected) => {
      expect(isValidPreferredDate(preferredDate, now)).toBe(expected);
    });

    it("counts days on the Bangkok calendar, not UTC", () => {
      // 23:59:59.999 on 2026-10-30 in Bangkok: still today, so tomorrow is 2026-10-31.
      const beforeMidnight = new Date("2026-10-30T16:59:59.999Z");
      expect(isValidPreferredDate("2026-10-31", beforeMidnight)).toBe(true);
      expect(isValidPreferredDate("2026-12-29", beforeMidnight)).toBe(true);
      expect(isValidPreferredDate("2026-12-30", beforeMidnight)).toBe(false);

      // 00:00 on 2026-10-31 in Bangkok while UTC is still 2026-10-30: 2026-10-31 is today.
      const atMidnight = new Date("2026-10-30T17:00:00.000Z");
      expect(isValidPreferredDate("2026-10-31", atMidnight)).toBe(false);
      expect(isValidPreferredDate("2026-11-01", atMidnight)).toBe(true);
      expect(isValidPreferredDate("2026-12-30", atMidnight)).toBe(true);
      expect(isValidPreferredDate("2026-12-31", atMidnight)).toBe(false);
    });

    it("crosses month and year ends", () => {
      const lateDecember = new Date("2026-12-31T05:00:00.000Z");
      expect(isValidPreferredDate("2027-01-01", lateDecember)).toBe(true);
      expect(isValidPreferredDate("2027-03-01", lateDecember)).toBe(true);
      expect(isValidPreferredDate("2027-03-02", lateDecember)).toBe(false);
    });
  });
});
