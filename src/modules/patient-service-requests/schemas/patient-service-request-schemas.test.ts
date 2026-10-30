import { describe, expect, it } from "vitest";

import { patientServiceRequestCreateSchema } from "./patient-service-request-schemas";

const base = {
  relationshipId: "0b7c6f0a-8f61-4a55-9b1b-0e0b6f5a1c11",
  offeringId: "5c3d2e1f-0a9b-4c8d-8e7f-6a5b4c3d2e1f",
};

describe("patientServiceRequestCreateSchema (ADR-0023)", () => {
  it("keeps accepting a request without preferences", () => {
    expect(patientServiceRequestCreateSchema.parse({ ...base, preferredOsmRelationshipId: null })).toEqual({
      ...base,
      preferredOsmRelationshipId: null,
    });
  });

  it("accepts a preferred date, slot and trimmed note", () => {
    expect(
      patientServiceRequestCreateSchema.parse({
        ...base,
        preferredDate: "2026-11-02",
        preferredSlot: "MORNING",
        note: "  ขอช่วงก่อนเที่ยง  ",
      }),
    ).toEqual({ ...base, preferredDate: "2026-11-02", preferredSlot: "MORNING", note: "ขอช่วงก่อนเที่ยง" });
  });

  it("treats a blank note as no note", () => {
    expect(patientServiceRequestCreateSchema.parse({ ...base, note: "   " })).toEqual(base);
  });

  it.each([
    [{ preferredDate: "2026-11-02" }],
    [{ preferredSlot: "ANY" }],
    [{ preferredDate: "2026-02-30", preferredSlot: "ANY" }],
    [{ preferredDate: "02/11/2026", preferredSlot: "ANY" }],
    [{ preferredDate: "2026-11-02", preferredSlot: "EVENING" }],
    [{ note: "ก".repeat(501) }],
  ])("rejects %j", (preferences) => {
    expect(patientServiceRequestCreateSchema.safeParse({ ...base, ...preferences }).success).toBe(false);
  });
});
