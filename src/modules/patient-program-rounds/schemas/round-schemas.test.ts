import { describe, expect, it } from "vitest";

import { roundReviewRequestSchema, roundVitalsRequestSchema } from "./round-schemas";

const programId = "33333333-3333-4333-8333-333333333333";
const nonce = "44444444-4444-4444-8444-444444444444";

function vitals(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    roundNumber: 1,
    submissionNonce: nonce,
    serviceDate: "2026-10-01",
    weight: 70,
    ...overrides,
  };
}

describe("round vitals request schema", () => {
  it("accepts rounds 1-2 with at least one measurement", () => {
    expect(roundVitalsRequestSchema.safeParse(vitals()).success).toBe(true);
    expect(roundVitalsRequestSchema.safeParse(vitals({ roundNumber: 2 })).success).toBe(true);
    expect(
      roundVitalsRequestSchema.safeParse(vitals({ weight: null, bloodSugar: 0 })).success,
    ).toBe(true);
  });

  it("rejects rounds 3-6 (their vitals live on the Follow-up) and out-of-range rounds", () => {
    for (const roundNumber of [0, 3, 4, 6, 7]) {
      expect(roundVitalsRequestSchema.safeParse(vitals({ roundNumber })).success).toBe(false);
    }
  });

  it("requires a measurement, a valid date and a nonce", () => {
    expect(roundVitalsRequestSchema.safeParse(vitals({ weight: null })).success).toBe(false);
    expect(roundVitalsRequestSchema.safeParse(vitals({ serviceDate: "2026-02-30" })).success).toBe(false);
    expect(roundVitalsRequestSchema.safeParse(vitals({ submissionNonce: "nope" })).success).toBe(false);
  });

  it("uses the Baseline/Follow-up measurement conventions (finite, positive, bounded)", () => {
    expect(roundVitalsRequestSchema.safeParse(vitals({ weight: 0 })).success).toBe(false);
    expect(roundVitalsRequestSchema.safeParse(vitals({ weight: -1 })).success).toBe(false);
    expect(roundVitalsRequestSchema.safeParse(vitals({ weight: Number.NaN })).success).toBe(false);
    expect(roundVitalsRequestSchema.safeParse(vitals({ heightCm: 1_000_001 })).success).toBe(false);
    expect(roundVitalsRequestSchema.safeParse(vitals({ bloodSugar: -1 })).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(roundVitalsRequestSchema.safeParse(vitals({ recordedByUserId: nonce })).success).toBe(false);
  });
});

describe("round review request schema", () => {
  const review = { patientProgramId: programId, roundNumber: 3, toolCode: "DREAM_CARD", submissionNonce: nonce };

  it("accepts only reviewable tools in rounds 1-6", () => {
    expect(roundReviewRequestSchema.safeParse(review).success).toBe(true);
    expect(roundReviewRequestSchema.safeParse({ ...review, toolCode: "KNOW_SELF" }).success).toBe(false);
    expect(roundReviewRequestSchema.safeParse({ ...review, toolCode: "HEALTHY_PLAN" }).success).toBe(false);
    expect(roundReviewRequestSchema.safeParse({ ...review, roundNumber: 7 }).success).toBe(false);
  });

  it("does not accept a client-chosen source or mode", () => {
    expect(roundReviewRequestSchema.safeParse({ ...review, source: "EXTRA" }).success).toBe(false);
    expect(roundReviewRequestSchema.safeParse({ ...review, mode: "RECORDED" }).success).toBe(false);
  });
});
