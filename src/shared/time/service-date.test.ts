import { describe, expect, it } from "vitest";

import { isServiceDateAfter, serviceDateSchema, serviceDateToUtcDate, toServiceDateOnly } from "./service-date";

describe("service date", () => {
  it("uses the Asia/Bangkok calendar date", () => {
    expect(toServiceDateOnly(new Date("2026-08-17T16:59:59.000Z"))).toBe("2026-08-17");
    expect(toServiceDateOnly(new Date("2026-08-17T17:00:00.000Z"))).toBe("2026-08-18");
  });

  it("rejects dates after today in Bangkok only", () => {
    const now = new Date("2026-08-17T18:30:00.000Z"); // 2026-08-18 01:30 Bangkok
    expect(isServiceDateAfter("2026-08-18", now)).toBe(false);
    expect(isServiceDateAfter("2026-08-19", now)).toBe(true);
  });

  it("validates real calendar dates and stores them at UTC midnight", () => {
    expect(serviceDateSchema.safeParse("2026-02-28").success).toBe(true);
    expect(serviceDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(serviceDateSchema.safeParse("2026-8-1").success).toBe(false);
    expect(serviceDateToUtcDate("2026-08-01").toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});
