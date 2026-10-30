import { describe, expect, it } from "vitest";

import {
  patientServiceRequestConfirmSchema,
  patientServiceRequestCreateSchema,
  patientServiceRequestRejectSchema,
} from "./patient-service-request-schemas";

const base = {
  relationshipId: "0b7c6f0a-8f61-4a55-9b1b-0e0b6f5a1c11",
  offeringId: "5c3d2e1f-0a9b-4c8d-8e7f-6a5b4c3d2e1f",
  preferredDate: "2026-11-02",
  preferredSlot: "MORNING",
};

describe("patientServiceRequestCreateSchema (ADR-0023)", () => {
  it("accepts a preferred date, slot and trimmed note", () => {
    expect(
      patientServiceRequestCreateSchema.parse({ ...base, preferredOsmRelationshipId: null, note: "  ขอช่วงก่อนเที่ยง  " }),
    ).toEqual({ ...base, preferredOsmRelationshipId: null, note: "ขอช่วงก่อนเที่ยง" });
  });

  it("treats a blank note as no note", () => {
    expect(patientServiceRequestCreateSchema.parse({ ...base, note: "   " })).toEqual(base);
  });

  it.each([
    [{ preferredDate: undefined }],
    [{ preferredSlot: undefined }],
    [{ preferredDate: "2026-02-30" }],
    [{ preferredDate: "02/11/2026" }],
    [{ preferredSlot: "EVENING" }],
    [{ note: "ก".repeat(501) }],
  ])("rejects %j", (change) => {
    expect(patientServiceRequestCreateSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });
});

describe("patientServiceRequestConfirmSchema (ADR-0023)", () => {
  const confirm = {
    requestId: "0b7c6f0a-8f61-4a55-9b1b-0e0b6f5a1c11",
    scheduledAt: "2026-11-02T09:00:00.000+07:00",
    osmUserId: "5c3d2e1f-0a9b-4c8d-8e7f-6a5b4c3d2e1f",
    submissionNonce: "6f1d6c1e-2b4a-4d8e-9a3f-1c2b3d4e5f60",
  };

  it("requires the time, the อสม. and a nonce", () => {
    expect(patientServiceRequestConfirmSchema.safeParse(confirm).success).toBe(true);
    for (const key of ["scheduledAt", "osmUserId", "submissionNonce"] as const) {
      expect(patientServiceRequestConfirmSchema.safeParse({ ...confirm, [key]: undefined }).success).toBe(false);
    }
    expect(patientServiceRequestConfirmSchema.safeParse({ ...confirm, type: "ASSESSMENT" }).success).toBe(false);
  });
});

describe("patientServiceRequestRejectSchema (ADR-0023)", () => {
  const requestId = "0b7c6f0a-8f61-4a55-9b1b-0e0b6f5a1c11";

  it("requires a trimmed reason of at most 500 characters", () => {
    expect(patientServiceRequestRejectSchema.parse({ requestId, reason: "  ไม่มี อสม. ว่าง  " })).toEqual({
      requestId,
      reason: "ไม่มี อสม. ว่าง",
    });
    expect(patientServiceRequestRejectSchema.safeParse({ requestId, reason: "   " }).success).toBe(false);
    expect(patientServiceRequestRejectSchema.safeParse({ requestId }).success).toBe(false);
    expect(patientServiceRequestRejectSchema.safeParse({ requestId, reason: "ก".repeat(501) }).success).toBe(false);
  });
});
